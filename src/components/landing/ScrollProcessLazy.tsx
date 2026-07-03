"use client";

import dynamic from "next/dynamic";
import ScrollProcessStatic from "./ScrollProcessStatic";

// three.js + GSAP (~180 ko gzip) ne servent qu'à cette section : on les
// isole dans un chunk async chargé après hydratation, hors du bundle
// critique de la landing. ssr:false est voulu — le serveur rend de toute
// façon la version statique (le composant 3D ne s'active qu'après examen
// de WebGL et prefers-reduced-motion côté client).
const ScrollProcess = dynamic(() => import("./ScrollProcess"), {
  ssr: false,
  loading: () => <ScrollProcessStatic />,
});

export default function ScrollProcessLazy() {
  return <ScrollProcess />;
}
