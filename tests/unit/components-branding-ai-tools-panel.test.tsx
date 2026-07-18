// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks — api helpers & next/navigation
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/portal/branding/profiles/1',
}));

// We mock the _lib/api module that the component calls
const mockGenerateTheme = vi.fn();
const mockGenerateMessaging = vi.fn();
const mockRewriteField = vi.fn();

vi.mock(
  '@/app/portal/branding/profiles/[profileId]/_lib/api',
  () => ({
    generateTheme: (...args: any[]) => mockGenerateTheme(...args),
    generateMessaging: (...args: any[]) => mockGenerateMessaging(...args),
    rewriteField: (...args: any[]) => mockRewriteField(...args),
  }),
);

// ---------------------------------------------------------------------------
// Subject under test (imported AFTER mocks)
// ---------------------------------------------------------------------------
import { AIGeneratorPanel, RewriteModal } from '@/app/portal/branding/profiles/[profileId]/_components/AIToolsPanel';
import type { ProfileData, MessagingData } from '@/app/portal/branding/profiles/[profileId]/_lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    id: 1,
    name: 'Test Profile',
    isDefault: false,
    logoUrl: '',
    logoAlt: '',
    logoSquareUrl: '',
    logoRectUrl: '',
    logoText: '',
    logoIconUrl: '',
    primaryColor: '#2563eb',
    secondaryColor: '#1e40af',
    accentColor: '#f59e0b',
    backgroundColor: '#ffffff',
    textColor: '#111827',
    headingFont: '',
    bodyFont: '',
    typography: {},
    darkMode: {},
    navTemplate: 'classic',
    navPosition: 'top',
    navBackground: '#ffffff',
    navTextColor: '#111827',
    borderRadius: '8px',
    linkColor: '',
    linkHoverColor: '',
    buttonStyle: {},
    buttonPresets: [],
    faviconUrl: '',
    ogImageUrl: '',
    ...overrides,
  };
}

function makeMessaging(overrides: Partial<MessagingData> = {}): MessagingData {
  return {
    companyName: 'Acme Corp',
    tagline: 'The best',
    missionStatement: 'Our mission',
    visionStatement: 'Our vision',
    valueProposition: 'Great value',
    toneOfVoice: 'Professional',
    brandPersonality: 'Bold',
    writingStyle: 'Concise',
    elevatorPitch: 'We do X',
    boilerplate: 'Founded in 2020',
    keyDifferentiators: ['Fast', 'Reliable'],
    targetAudience: 'SMBs',
    industry: 'Software',
    yearFounded: '2020',
    companySize: '10-50',
    headquarters: 'Philadelphia',
    websiteUrl: 'https://acme.example',
    socialProof: '500 clients',
    keyClients: 'Big Co',
    certifications: 'ISO 9001',
    additionalContext: '',
    toneAxes: {},
    voiceSamples: [],
    ...overrides,
  };
}

/** Helper to open the AI panel (click the toggle button) */
function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: /Generate with AI/i }));
}

/** Helper to get the inner "Generate" / "Regenerate" / "Generating..." action button (not the toggle) */
function getActionButton() {
  // The action button is the one that is NOT "Generate with AI" — find it by exact text
  const buttons = screen.getAllByRole('button');
  const action = buttons.find(
    (b) =>
      b.textContent?.includes('Generate') &&
      !b.textContent?.includes('Generate with AI'),
  );
  if (!action) throw new Error('Action button not found');
  return action;
}

// ---------------------------------------------------------------------------
// AIGeneratorPanel tests
// ---------------------------------------------------------------------------

describe('AIGeneratorPanel', () => {
  let update: ReturnType<typeof vi.fn>;
  let setMessaging: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    update = vi.fn();
    setMessaging = vi.fn();
  });

  // --- Render (collapsed state) ---

  it('renders "Generate with AI" toggle button', () => {
    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    expect(screen.getByRole('button', { name: /Generate with AI/i })).toBeInTheDocument();
  });

  it('does not show textarea when collapsed', () => {
    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    expect(screen.queryByPlaceholderText(/boutique web development/i)).not.toBeInTheDocument();
  });

  // --- Expand / collapse ---

  it('opens the panel on toggle click', () => {
    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    expect(screen.getByPlaceholderText(/boutique web development/i)).toBeInTheDocument();
  });

  it('closes the panel on second toggle click', () => {
    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    openPanel();
    expect(screen.queryByPlaceholderText(/boutique web development/i)).not.toBeInTheDocument();
  });

  // --- Checkboxes ---

  it('shows "Visual Identity" and "Messaging" checkboxes when open', () => {
    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    expect(screen.getByRole('checkbox', { name: /Visual Identity/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Messaging/i })).toBeChecked();
  });

  it('unchecking both checkboxes shows error message', () => {
    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    fireEvent.click(screen.getByRole('checkbox', { name: /Visual Identity/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Messaging/i }));
    expect(screen.getByText(/Select at least one section/i)).toBeInTheDocument();
  });

  it('Generate button is disabled when description is empty', () => {
    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    expect(getActionButton()).toBeDisabled();
  });

  it('Generate button is disabled when both checkboxes are unchecked', () => {
    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    fireEvent.change(screen.getByPlaceholderText(/boutique web development/i), {
      target: { value: 'Some description' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Visual Identity/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Messaging/i }));
    expect(getActionButton()).toBeDisabled();
  });

  it('Generate button becomes enabled when description entered and at least one box checked', () => {
    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    fireEvent.change(screen.getByPlaceholderText(/boutique web development/i), {
      target: { value: 'A boutique agency' },
    });
    expect(getActionButton()).not.toBeDisabled();
  });

  // --- Generate success (visual + messaging) ---

  it('calls generateTheme and generateMessaging with description text', async () => {
    const themeResponse = {
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { primaryColor: '#ff0000' },
      }),
    } as unknown as Response;
    const messagingResponse = {
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { companyName: 'New Corp' },
      }),
    } as unknown as Response;

    mockGenerateTheme.mockResolvedValue(themeResponse);
    mockGenerateMessaging.mockResolvedValue(messagingResponse);

    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();

    fireEvent.change(screen.getByPlaceholderText(/boutique web development/i), {
      target: { value: 'Great brand' },
    });

    await act(async () => {
      fireEvent.click(getActionButton());
    });

    await waitFor(() => expect(mockGenerateTheme).toHaveBeenCalledWith('Great brand'));
    await waitFor(() => expect(mockGenerateMessaging).toHaveBeenCalledWith('Great brand'));
  });

  it('calls update() with theme data on successful visual generation', async () => {
    const themeData = {
      primaryColor: '#ff0000',
      secondaryColor: '#00ff00',
    };
    const themeResponse = {
      json: vi.fn().mockResolvedValue({ success: true, data: themeData }),
    } as unknown as Response;
    const messagingResponse = {
      json: vi.fn().mockResolvedValue({ success: true, data: { companyName: 'X' } }),
    } as unknown as Response;

    mockGenerateTheme.mockResolvedValue(themeResponse);
    mockGenerateMessaging.mockResolvedValue(messagingResponse);

    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    fireEvent.change(screen.getByPlaceholderText(/boutique web development/i), {
      target: { value: 'Brand description' },
    });

    await act(async () => {
      fireEvent.click(getActionButton());
    });

    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    const [arg] = update.mock.calls[0];
    expect(arg.primaryColor).toBe('#ff0000');
  });

  it('calls setMessaging() with messaging data on successful messaging generation', async () => {
    const themeResponse = {
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as unknown as Response;
    const messagingResponse = {
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { companyName: 'Generated Co', tagline: 'We innovate' },
      }),
    } as unknown as Response;

    mockGenerateTheme.mockResolvedValue(themeResponse);
    mockGenerateMessaging.mockResolvedValue(messagingResponse);

    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    fireEvent.change(screen.getByPlaceholderText(/boutique web development/i), {
      target: { value: 'Brand description' },
    });

    await act(async () => {
      fireEvent.click(getActionButton());
    });

    await waitFor(() => expect(setMessaging).toHaveBeenCalledOnce());
    // setMessaging receives an updater function; call it with prev to inspect result
    const updater = setMessaging.mock.calls[0][0];
    const prev = makeMessaging();
    const result = updater(prev);
    expect(result.companyName).toBe('Generated Co');
    expect(result.tagline).toBe('We innovate');
  });

  it('collapses panel after successful generation', async () => {
    const themeResponse = {
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as unknown as Response;
    const messagingResponse = {
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as unknown as Response;

    mockGenerateTheme.mockResolvedValue(themeResponse);
    mockGenerateMessaging.mockResolvedValue(messagingResponse);

    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    fireEvent.change(screen.getByPlaceholderText(/boutique web development/i), {
      target: { value: 'Some brand' },
    });

    await act(async () => {
      fireEvent.click(getActionButton());
    });

    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/boutique web development/i)).not.toBeInTheDocument(),
    );
  });

  // --- Generate only visual (messaging unchecked) ---

  it('only calls generateTheme when messaging checkbox unchecked', async () => {
    const themeResponse = {
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as unknown as Response;
    mockGenerateTheme.mockResolvedValue(themeResponse);

    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    fireEvent.click(screen.getByRole('checkbox', { name: /Messaging/i }));
    fireEvent.change(screen.getByPlaceholderText(/boutique web development/i), {
      target: { value: 'Visual only' },
    });

    await act(async () => {
      fireEvent.click(getActionButton());
    });

    await waitFor(() => expect(mockGenerateTheme).toHaveBeenCalledOnce());
    expect(mockGenerateMessaging).not.toHaveBeenCalled();
  });

  // --- Generate only messaging (visual unchecked) ---

  it('only calls generateMessaging when visual checkbox unchecked', async () => {
    const messagingResponse = {
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as unknown as Response;
    mockGenerateMessaging.mockResolvedValue(messagingResponse);

    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    fireEvent.click(screen.getByRole('checkbox', { name: /Visual Identity/i }));
    fireEvent.change(screen.getByPlaceholderText(/boutique web development/i), {
      target: { value: 'Messaging only' },
    });

    await act(async () => {
      fireEvent.click(getActionButton());
    });

    await waitFor(() => expect(mockGenerateMessaging).toHaveBeenCalledOnce());
    expect(mockGenerateTheme).not.toHaveBeenCalled();
  });

  // --- Error path ---

  it('handles generate failure gracefully (no crash, generates=false after)', async () => {
    mockGenerateTheme.mockRejectedValue(new Error('API down'));
    mockGenerateMessaging.mockRejectedValue(new Error('API down'));

    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    fireEvent.change(screen.getByPlaceholderText(/boutique web development/i), {
      target: { value: 'Error case' },
    });

    await act(async () => {
      fireEvent.click(getActionButton());
    });

    // Should still recover — button becomes re-enabled (not stuck in generating)
    await waitFor(() => expect(getActionButton()).not.toBeDisabled());
    // update should NOT have been called
    expect(update).not.toHaveBeenCalled();
  });

  // --- success=false from API ---

  it('does not call update when success=false in visual response', async () => {
    const themeResponse = {
      json: vi.fn().mockResolvedValue({ success: false }),
    } as unknown as Response;
    const messagingResponse = {
      json: vi.fn().mockResolvedValue({ success: false }),
    } as unknown as Response;

    mockGenerateTheme.mockResolvedValue(themeResponse);
    mockGenerateMessaging.mockResolvedValue(messagingResponse);

    render(<AIGeneratorPanel profile={makeProfile()} update={update} setMessaging={setMessaging} />);
    openPanel();
    fireEvent.change(screen.getByPlaceholderText(/boutique web development/i), {
      target: { value: 'Failed case' },
    });

    await act(async () => {
      fireEvent.click(getActionButton());
    });

    await waitFor(() => expect(mockGenerateTheme).toHaveBeenCalledOnce());
    expect(update).not.toHaveBeenCalled();
    expect(setMessaging).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// RewriteModal tests
// ---------------------------------------------------------------------------

describe('RewriteModal', () => {
  let onAccept: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;
  const MODAL = { field: 'tagline', label: 'Tagline' };

  beforeEach(() => {
    vi.clearAllMocks();
    onAccept = vi.fn();
    onClose = vi.fn();
  });

  // --- Null modal ---

  it('renders nothing when modal is null', () => {
    const { container } = render(
      <RewriteModal
        modal={null}
        messaging={makeMessaging()}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  // --- Render open modal ---

  it('renders modal title with field label', () => {
    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging()}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    expect(screen.getByText(/Rewrite: Tagline/i)).toBeInTheDocument();
  });

  it('shows current field value', () => {
    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging({ tagline: 'The best products' })}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('The best products')).toBeInTheDocument();
  });

  it('does not show "Current value" section when field is empty', () => {
    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging({ tagline: '' })}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    expect(screen.queryByText(/Current value/i)).not.toBeInTheDocument();
  });

  it('renders prompt textarea', () => {
    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging()}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    expect(screen.getByPlaceholderText(/Make it more concise/i)).toBeInTheDocument();
  });

  it('Generate button is disabled when prompt is empty', () => {
    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging()}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('button', { name: /Generate/i })).toBeDisabled();
  });

  it('Generate button becomes enabled when prompt is typed', () => {
    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging()}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Make it more concise/i), {
      target: { value: 'Be more playful' },
    });
    expect(screen.getByRole('button', { name: /Generate/i })).not.toBeDisabled();
  });

  // --- Close ---

  it('calls onClose when close button clicked', () => {
    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging()}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    // The close button contains the material icon text "close" and is in the header
    // Use getAllByRole and pick the button that is NOT the Generate button
    const buttons = screen.getAllByRole('button');
    // The close button is the one that contains the "close" icon text and no "Generate"
    const closeBtn = buttons.find(
      (b) => b.querySelector
        ? b.textContent?.includes('close') && !b.textContent?.includes('Generate')
        : false,
    );
    if (!closeBtn) throw new Error('Close button not found');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop clicked', () => {
    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging()}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    // The backdrop div has class `absolute inset-0 bg-black/50`
    const backdrop = document.querySelector('.absolute.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  // --- Generate (fetch success) ---

  it('calls rewriteField with correct payload and shows preview', async () => {
    mockRewriteField.mockResolvedValue({ success: true, data: 'Generated tagline text' });

    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging({ tagline: 'Old tagline' })}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Make it more concise/i), {
      target: { value: 'Make it punchy' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    });

    await waitFor(() => expect(mockRewriteField).toHaveBeenCalledOnce());
    const [arg] = mockRewriteField.mock.calls[0];
    expect(arg.fieldName).toBe('tagline');
    expect(arg.prompt).toBe('Make it punchy');

    expect(await screen.findByText('Generated tagline text')).toBeInTheDocument();
  });

  it('shows Regenerate and Accept buttons after preview appears', async () => {
    mockRewriteField.mockResolvedValue({ success: true, data: 'New tagline' });

    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging()}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Make it more concise/i), {
      target: { value: 'Be bold' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    });

    await screen.findByText('New tagline');
    expect(screen.getByRole('button', { name: /Regenerate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Accept/i })).toBeInTheDocument();
  });

  // --- Apply result (accept) ---

  it('calls onAccept with field and preview value on Accept click', async () => {
    mockRewriteField.mockResolvedValue({ success: true, data: 'Accepted tagline' });

    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging()}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Make it more concise/i), {
      target: { value: 'Be direct' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    });

    await screen.findByText('Accepted tagline');

    fireEvent.click(screen.getByRole('button', { name: /Accept/i }));
    expect(onAccept).toHaveBeenCalledWith('tagline', 'Accepted tagline');
  });

  // --- Generate (fetch error) ---

  it('handles rewriteField rejection gracefully', async () => {
    mockRewriteField.mockRejectedValue(new Error('API error'));

    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging()}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Make it more concise/i), {
      target: { value: 'Error path' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    });

    // No preview shown, button re-enables
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Generate/i })).not.toBeDisabled(),
    );
    expect(screen.queryByText(/Preview/i)).not.toBeInTheDocument();
  });

  // --- Generate (success=false) ---

  it('does not show preview when rewriteField returns success=false', async () => {
    mockRewriteField.mockResolvedValue({ success: false });

    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging()}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Make it more concise/i), {
      target: { value: 'Failed' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    });

    await waitFor(() => expect(mockRewriteField).toHaveBeenCalledOnce());
    expect(screen.queryByText(/Regenerate/i)).not.toBeInTheDocument();
  });

  // --- Enter key shortcut ---

  it('submits on Enter key in prompt textarea', async () => {
    mockRewriteField.mockResolvedValue({ success: true, data: 'Key result' });

    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging()}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    const textarea = screen.getByPlaceholderText(/Make it more concise/i);
    fireEvent.change(textarea, { target: { value: 'Enter test' } });

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    });

    await waitFor(() => expect(mockRewriteField).toHaveBeenCalledOnce());
  });

  it('does NOT submit on Shift+Enter in prompt textarea', async () => {
    render(
      <RewriteModal
        modal={MODAL}
        messaging={makeMessaging()}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    const textarea = screen.getByPlaceholderText(/Make it more concise/i);
    fireEvent.change(textarea, { target: { value: 'Shift enter test' } });

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(mockRewriteField).not.toHaveBeenCalled();
  });
});
