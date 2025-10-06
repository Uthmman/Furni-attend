export default function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"
        role="status"
      >
        <span className="sr-only">Loading...</span>
      </div>
    </div>
  );
}
