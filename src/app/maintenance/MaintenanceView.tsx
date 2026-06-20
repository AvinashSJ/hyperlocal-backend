"use client";

type MaintenanceValue = {
  enabled: boolean;
  reason: "maintenance" | "technical" | "operations";
  message: string;
  etaHours: number | null;
};

const REASON_LABEL: Record<MaintenanceValue["reason"], string> = {
  maintenance: "Scheduled Maintenance",
  technical: "Technical Issue",
  operations: "Operations Constraint",
};

export default function MaintenanceView({
  app,
}: {
  app: MaintenanceValue;
}) {
  if (!app.enabled) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light py-5 px-3">
        <div className="container" style={{ maxWidth: 560 }}>
          <div className="card border-0 shadow-sm rounded-4">
            <div className="card-body p-4 p-md-5 text-center">
              <div className="bg-success bg-opacity-10 text-success rounded-circle d-inline-flex align-items-center justify-content-center mb-3" style={{ width: 64, height: 64 }}>
                <span className="fs-2 fw-bold">✓</span>
              </div>
              <h1 className="h4 fw-bold">All systems operational</h1>
              <p className="text-muted mb-0">
                The admin panel is online. If you reached this page by
                mistake, head back to the dashboard.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light py-5 px-3">
      <div className="container" style={{ maxWidth: 560 }}>
        <div className="card border-0 shadow-sm rounded-4">
          <div className="card-body p-4 p-md-5">
            <div className="text-center mb-3">
              <div className="bg-warning bg-opacity-10 text-warning rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: 64, height: 64 }}>
                <span className="fs-2 fw-bold">!</span>
              </div>
            </div>
            <h1 className="h4 fw-bold text-center">
              {REASON_LABEL[app.reason]}
            </h1>
            {app.message ? (
              <p className="text-muted text-center mb-4">{app.message}</p>
            ) : (
              <p className="text-muted text-center mb-4">
                The admin panel is temporarily unavailable.
              </p>
            )}
            {app.etaHours !== null && app.etaHours > 0 && (
              <div className="alert alert-light border text-center">
                <small className="text-muted d-block">Estimated back online in</small>
                <strong className="fs-5">
                  {app.etaHours} hour{app.etaHours === 1 ? "" : "s"}
                </strong>
              </div>
            )}
            <div className="d-grid mt-4">
              <a href="/auth/login" className="btn btn-outline-primary">
                Try again
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
