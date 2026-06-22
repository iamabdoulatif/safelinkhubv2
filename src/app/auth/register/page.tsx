import Link from "next/link";
import RegisterForm from "./RegisterForm";

export default function RegisterPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-white px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span className="text-2xl font-bold tracking-tight text-slate-900">
            Safe<span className="text-emerald-500">LinkHub</span>
          </span>
          <p className="mt-2 text-sm text-slate-500">
            Créez votre compte SafeLinkHub
          </p>
        </div>

        <RegisterForm />

        <p className="mt-6 text-center text-sm text-slate-500">
          Vous avez déjà un compte ?{" "}
          <Link
            href="/auth/login"
            className="font-semibold text-slate-900 hover:underline"
          >
            Connexion
          </Link>
        </p>
      </div>
    </div>
  );
}
