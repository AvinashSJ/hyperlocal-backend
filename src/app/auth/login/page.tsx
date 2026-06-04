import LoginForm from "./LoginForm";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light py-5 px-3">
      <div className="container" style={{ maxWidth: 980 }}>
        <div className="row g-0 shadow rounded-4 overflow-hidden bg-white">
          <div className="col-lg-6 p-5">
            <div className="text-center mb-4">
              <h1 className="h3 fw-bold">Hyperlocal Admin</h1>
              <p className="text-muted">Sign in to manage your store</p>
            </div>

            {params.message ? (
              <div className="alert alert-success py-2" role="alert">
                {params.message}
              </div>
            ) : null}

            {params.error ? (
              <div className="alert alert-danger py-2" role="alert">
                {params.error}
              </div>
            ) : null}

            <LoginForm />
          </div>

          <div className="col-lg-6 d-none d-lg-flex align-items-center justify-content-center bg-primary bg-opacity-10">
            <div className="text-center p-5">
              <div className="mb-3">
                <div className="bg-primary text-white rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: 80, height: 80 }}>
                  <span className="fs-1 fw-bold">H</span>
                </div>
              </div>
              <h2 className="h4 fw-bold">Hyperlocal</h2>
              <p className="text-muted">FreshCart General Store</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
