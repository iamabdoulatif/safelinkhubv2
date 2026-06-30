import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SafeLinkHub | Mobile Money Hotspot",
  description:
    "SafeLinkHub is the most advanced Hotspot and ISP Automation Platform, built to manage, automate, and grow any network.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased overflow-x-hidden`}
    >
      <body className="min-h-full flex flex-col bg-white text-slate-900">
        {/* Splash loader — rendered as plain HTML before React hydrates,
            removed by the inline script once the page is painted. */}
        <div id="slh-splash" aria-hidden="true">
          <span className="slh-loader" />
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                var el=document.getElementById('slh-splash');
                if(!el)return;
                function dismiss(){
                  el.classList.add('slh-fade');
                  setTimeout(function(){el.remove();},4100);
                }
                if(document.readyState==='complete'){dismiss();}
                else{window.addEventListener('load',dismiss);}
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  );
}
