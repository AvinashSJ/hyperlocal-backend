import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light py-5 px-3">
      <div className="text-center">
        <h1 className="display-1 fw-bold text-muted">403</h1>
        <h4 className="fw-bold mb-2">Access Denied</h4>
        <p className="text-muted mb-4">
          You don&apos;t have permission to access this page.
        </p>
        <Link href="/" className="btn btn-primary">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
