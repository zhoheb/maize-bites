import { EmptyState } from '../components/States';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-[35rem] px-4 py-10">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        title="That page doesn't exist."
        actions={[{ label: 'Find free food', to: '/', primary: true }]}
      />
    </div>
  );
}
