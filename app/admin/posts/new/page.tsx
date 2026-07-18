import PostForm from '@/components/admin/PostForm';
import { auth } from '@/lib/auth';

export default async function NewPostPage() {
  const session = await auth();

  return <PostForm mode="create" />;
}
