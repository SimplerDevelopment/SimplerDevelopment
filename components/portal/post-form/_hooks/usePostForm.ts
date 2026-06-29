// Form state machine for PortalPostForm: formData, blocks, autosave, save callback.
'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { Block } from '@/types/blocks';
import { bindPostToYjs, type BoundPost } from '@/lib/realtime/post-binding';
import { createPost, fetchCategories, fetchTags, updatePost } from '../_lib/api';
import {
  fingerprintLoops,
  generateSlug,
  parseContentToBlocks,
} from '../_lib/validation';
import type { Post, SaveStatus, TaxonomyItem } from '../_lib/types';

interface UsePostFormArgs {
  siteId: number;
  post?: Post;
  mode: 'create' | 'edit';
  /** Editor mode driven by the orchestrator (visual / classic / iframe). */
  editorMode: 'visual' | 'classic' | 'iframe';
  /**
   * When provided, blocks are mirrored into the Yjs doc and remote updates
   * are routed back into React state. Autosave is disabled while a doc is
   * connected — the realtime-server persists snapshots to Postgres on its
   * own schedule, so a parallel REST autosave would race the snapshot
   * write and cause double-saves / lost edits.
   */
  ydoc?: Y.Doc | null;
}

export interface UsePostFormReturn {
  formData: Post;
  setFormData: React.Dispatch<React.SetStateAction<Post>>;
  blocks: Block[];
  setBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
  loading: boolean;
  postSaveStatus: SaveStatus['status'];
  iframeSaveVersion: number;
  availableCategories: TaxonomyItem[];
  setAvailableCategories: React.Dispatch<React.SetStateAction<TaxonomyItem[]>>;
  availableTags: TaxonomyItem[];
  setAvailableTags: React.Dispatch<React.SetStateAction<TaxonomyItem[]>>;
  handleTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  savePost: (trigger?: 'autosave' | 'manual' | 'publish') => Promise<void>;
  formDataRef: React.MutableRefObject<Post>;
  autosaveTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

/**
 * Holds the post form's mutable state, refs, and save lifecycle. Exposed
 * helpers (handleTitleChange / handleSubmit / savePost) are stable callbacks
 * the orchestrator and section components can call without re-deriving them.
 */
export function usePostForm({ siteId, post, mode, editorMode, ydoc }: UsePostFormArgs): UsePostFormReturn {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [blocks, setBlocksState] = useState<Block[]>(parseContentToBlocks(post?.content || ''));

  // ── Realtime binding (Yjs) ─────────────────────────────────────────────
  // When a `ydoc` is provided we route user-driven setBlocks calls through
  // post-binding so they replicate to peers, and let the binding push
  // remote updates back into React state.
  const bindingRef = useRef<BoundPost | null>(null);
  const blocksStateRef = useRef<Block[]>(blocks);
  useLayoutEffect(() => {
    blocksStateRef.current = blocks;
  });
  const localUpdateInFlightRef = useRef(false);

  // setBlocks wrapper: when ydoc is connected, the canonical write is into
  // the Y doc; React state is the projection. When ydoc is null, behave
  // exactly like the bare React setState the rest of the editor expects.
  const setBlocks = useCallback<React.Dispatch<React.SetStateAction<Block[]>>>(
    (action) => {
      const cur = blocksStateRef.current;
      const next =
        typeof action === 'function'
          ? (action as (prev: Block[]) => Block[])(cur)
          : action;
      if (next === cur) return;
      // Mirror into React state immediately so the editor stays responsive.
      setBlocksState(next);
      blocksStateRef.current = next;
      // If realtime is connected, also publish the change to peers.
      if (bindingRef.current) {
        localUpdateInFlightRef.current = true;
        try {
          bindingRef.current.applyLocalBlocks(next);
        } finally {
          localUpdateInFlightRef.current = false;
        }
      }
    },
    [],
  );

  // Connect / reconnect the binding when the ydoc reference changes.
  useEffect(() => {
    if (!ydoc) {
      bindingRef.current = null;
      return;
    }
    const bound = bindPostToYjs({
      ydoc,
      initialBlocks: blocksStateRef.current,
      onRemoteBlocks: (next) => {
        // Apply remote-origin updates into React state without re-broadcasting.
        // The setter below uses setBlocksState directly — bindingRef.applyLocalBlocks
        // is intentionally bypassed.
        blocksStateRef.current = next;
        setBlocksState(next);
      },
      isLocalUpdate: () => localUpdateInFlightRef.current,
      markLocalUpdate: () => {
        localUpdateInFlightRef.current = true;
      },
    });
    bindingRef.current = bound;
    // Realtime is now the source of truth — disable REST autosave to avoid
    // double-writing while the realtime-server's snapshot persister runs.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug(
        '[usePostForm] Yjs doc attached — REST autosave disabled (server snapshots persist).',
      );
    }
    return () => {
      bound.unbind();
      if (bindingRef.current === bound) bindingRef.current = null;
    };
  }, [ydoc]);
  const [postSaveStatus, setPostSaveStatus] = useState<SaveStatus['status']>('idle');
  const [iframeSaveVersion, setIframeSaveVersion] = useState(0);
  const postSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formData, setFormData] = useState<Post>({
    title: post?.title || '',
    slug: post?.slug || '',
    postType: post?.postType || 'page',
    excerpt: post?.excerpt || '',
    content: post?.content || '',
    coverImage: post?.coverImage || '',
    published: post?.published || false,
    publishedAt: post?.publishedAt || null,
    categoryIds: post?.categoryIds || [],
    tagIds: post?.tagIds || [],
    seoTitle: post?.seoTitle || '',
    seoDescription: post?.seoDescription || '',
    ogImage: post?.ogImage || '',
    noIndex: post?.noIndex || false,
    canonicalUrl: post?.canonicalUrl || '',
    customCss: post?.customCss || '',
    customJs: post?.customJs || '',
    id: post?.id,
  });

  const [availableCategories, setAvailableCategories] = useState<TaxonomyItem[]>([]);
  const [availableTags, setAvailableTags] = useState<TaxonomyItem[]>([]);

  // Load available categories & tags for this website
  useEffect(() => {
    let cancelled = false;
    fetchCategories(siteId).then((rows) => {
      if (!cancelled) setAvailableCategories(rows);
    });
    fetchTags(siteId).then((rows) => {
      if (!cancelled) setAvailableTags(rows);
    });
    return () => { cancelled = true; };
  }, [siteId]);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setFormData(prev => ({
      ...prev,
      title,
      slug: mode === 'create' ? generateSlug(title) : prev.slug,
    }));
  }, [mode]);

  // Autosave: debounce block/form changes (only in edit mode with iframe editor)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocksRef = useRef(blocks);
  const formDataRef = useRef(formData);
  const isSavingRef = useRef(false);
  useLayoutEffect(() => {
    blocksRef.current = blocks;
    formDataRef.current = formData;
  });

  const savePost = useCallback(async (trigger: 'autosave' | 'manual' | 'publish' = 'manual') => {
    if (mode !== 'edit' || !post?.id || isSavingRef.current) return;
    isSavingRef.current = true;
    if (trigger !== 'autosave') setLoading(true);
    setPostSaveStatus('saving');
    if (postSaveTimer.current) clearTimeout(postSaveTimer.current);

    try {
      const data = await updatePost(siteId, post.id, formDataRef.current, blocksRef.current, trigger);
      if (data.success) {
        setPostSaveStatus('saved');
        postSaveTimer.current = setTimeout(() => setPostSaveStatus('idle'), 3000);
        if (trigger !== 'autosave' && editorMode !== 'iframe') {
          router.push(`/portal/websites/${siteId}`);
        }
        // Only reload iframe + refresh server data on manual/publish save.
        // Autosave syncs blocks via postMessage — reloading the iframe
        // resets scroll position and disrupts editing.
        if (trigger !== 'autosave') {
          setIframeSaveVersion(v => v + 1);
          router.refresh();
        }
      } else {
        setPostSaveStatus('error');
        postSaveTimer.current = setTimeout(() => setPostSaveStatus('idle'), 5000);
      }
    } catch {
      setPostSaveStatus('error');
      postSaveTimer.current = setTimeout(() => setPostSaveStatus('idle'), 5000);
    } finally {
      isSavingRef.current = false;
      setLoading(false);
    }
  }, [mode, post, siteId, editorMode, router]);

  // When the author switches the post type from the Page Details panel, save
  // immediately and bump the iframe so the new type's template wraps the
  // post on next render. Skip the initial mount value so we don't re-save +
  // reload right after opening the editor.
  const initialPostTypeRef = useRef(formData.postType);
  useEffect(() => {
    if (mode !== 'edit' || editorMode !== 'iframe') return;
    if (formData.postType === initialPostTypeRef.current) return;
    initialPostTypeRef.current = formData.postType;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    // Use 'manual' so savePost reloads the iframe (autosave intentionally
    // doesn't, to keep scroll/selection during normal editing).
    savePost('manual');
  }, [formData.postType, mode, editorMode, savePost]);

  // When any html-render block's `loop` config changes, force a manual save
  // so the iframe reloads — loop expansion is server-only, so authors won't
  // see new card-counts/post-type changes until the page is re-rendered.
  // Static field/value edits still autosave silently and update via the
  // postMessage channel, so this only fires for the rare loop-config edit.
  const initialLoopFingerprintRef = useRef(fingerprintLoops(blocks));
  useEffect(() => {
    if (mode !== 'edit' || editorMode !== 'iframe') return;
    const fp = fingerprintLoops(blocks);
    if (fp === initialLoopFingerprintRef.current) return;
    initialLoopFingerprintRef.current = fp;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    savePost('manual');
  }, [blocks, mode, editorMode, savePost]);

  // Debounced autosave on block changes (2s after last change). Skipped
  // entirely when a Yjs doc is connected — the realtime-server persists
  // snapshots to Postgres independently and a parallel REST autosave would
  // race that write.
  //
  // The previous version called JSON.stringify(blocks) on every effect run
  // — past ~30 blocks that's measurable cost on every keystroke. The state
  // tree is immutable, so reference equality on the blocks array IS the
  // change signal: anything that mutated something in the tree handed us a
  // new top-level array via setBlocks(prev => …). We only fall back to a
  // cheap structural fingerprint to skip the first effect run on mount.
  const lastSeenBlocksRef = useRef<Block[]>(blocks);
  useEffect(() => {
    if (mode !== 'edit' || editorMode !== 'iframe') return;
    if (ydoc) return; // realtime owns persistence
    if (lastSeenBlocksRef.current === blocks) return; // no actual change
    lastSeenBlocksRef.current = blocks;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      savePost('autosave');
    }, 2000);

    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [blocks, mode, editorMode, savePost, ydoc]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    if (mode === 'create') {
      setLoading(true);
      setPostSaveStatus('saving');
      if (postSaveTimer.current) clearTimeout(postSaveTimer.current);
      try {
        const data = await createPost(siteId, formData, blocks);
        if (data.success) {
          setPostSaveStatus('saved');
          // Redirect to edit mode so the iframe editor loads with the new post
          const newPostId = data.data?.id;
          if (newPostId) {
            router.push(`/portal/websites/${siteId}/posts/${newPostId}/edit`);
          } else {
            router.push(`/portal/websites/${siteId}`);
          }
          router.refresh();
        } else {
          setPostSaveStatus('error');
          postSaveTimer.current = setTimeout(() => setPostSaveStatus('idle'), 5000);
        }
      } catch {
        setPostSaveStatus('error');
        postSaveTimer.current = setTimeout(() => setPostSaveStatus('idle'), 5000);
      } finally {
        setLoading(false);
      }
    } else {
      // If not yet published, the Publish button should set published=true and save
      if (!formData.published) {
        setFormData(prev => ({ ...prev, published: true }));
        formDataRef.current = { ...formDataRef.current, published: true };
      }
      await savePost('publish');
    }
  }, [mode, siteId, formData, blocks, savePost, router]);

  return {
    formData,
    setFormData,
    blocks,
    setBlocks,
    loading,
    postSaveStatus,
    iframeSaveVersion,
    availableCategories,
    setAvailableCategories,
    availableTags,
    setAvailableTags,
    handleTitleChange,
    handleSubmit,
    savePost,
    formDataRef,
    autosaveTimer,
  };
}
