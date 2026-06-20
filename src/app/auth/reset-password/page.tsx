import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Defense in depth: if the user navigated to this page directly
  // (not via a forced reset), they shouldn't see it. Send them to
  // the dashboard.
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_reset_password, email")
    .eq("id", user.id)
    .single();

  if (!profile?.must_reset_password) {
    redirect("/dashboard");
  }

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light py-5 px-3">
      <div className="container" style={{ maxWidth: 480 }}>
        <div className="card shadow-sm border-0 rounded-4">
          <div className="card-body p-4 p-md-5">
            <div className="text-center mb-4">
              <div className="bg-warning bg-opacity-10 text-warning rounded-circle d-inline-flex align-items-center justify-content-center mb-3" style={{ width: 64, height: 64 }}>
                <span className="fs-2 fw-bold">!</span>
              </div>
              <h1 className="h4 fw-bold">Set a new password</h1>
              <p className="text-muted mb-0">
                Your password was reset by an administrator. Please set a new
                password to continue.
              </p>
              <p className="text-muted small mb-0 mt-1">
                Signed in as <strong>{profile.email ?? user.email}</strong>
              </p>
            </div>

            <ResetPasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}
