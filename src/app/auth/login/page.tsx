import Link from "next/link";
import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-1 justify-center bg-slate-50 px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span className="text-2xl font-bold tracking-tight text-slate-900">
            Safe<span className="text-emerald-500">LinkHub</span>
          </span>
          <p className="mt-2 text-sm text-slate-500">Connexion à SafeLinkHub</p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-sm text-slate-500">
          Vous n&apos;avez pas de compte ?{" "}
          <Link
            href="/auth/register"
            className="font-semibold text-emerald-600 hover:text-orange-500"
          >
            Inscrivez-vous
          </Link>
        </p>
      </div>
    </div>
  );
}
