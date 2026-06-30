export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]">
      <span className="slh-loader" />
      <style>{`
        .slh-loader {
          --color-1: #ffffff;
          --color-2: #10b981;
          --size: 4px;

          display: inline-block;
          position: relative;
          transform: rotateZ(45deg);
          perspective: calc(1000 * var(--size));
          border-radius: 50%;
          width: calc(48 * var(--size));
          height: calc(48 * var(--size));
          color: var(--color-1);
        }
        .slh-loader::before,
        .slh-loader::after {
          content: '';
          display: block;
          position: absolute;
          top: 0;
          left: 0;
          width: inherit;
          height: inherit;
          border-radius: 50%;
          transform: rotateX(70deg);
          animation: slh-spin 1s linear infinite;
        }
        .slh-loader::after {
          color: var(--color-2);
          transform: rotateY(70deg);
          animation-delay: 0.4s;
        }
        @keyframes slh-spin {
          0%,  100% { box-shadow:  0.2em  0     0 0 currentcolor; }
          12%        { box-shadow:  0.2em  0.2em 0 0 currentcolor; }
          25%        { box-shadow:  0      0.2em 0 0 currentcolor; }
          37%        { box-shadow: -0.2em  0.2em 0 0 currentcolor; }
          50%        { box-shadow: -0.2em  0     0 0 currentcolor; }
          62%        { box-shadow: -0.2em -0.2em 0 0 currentcolor; }
          75%        { box-shadow:  0     -0.2em 0 0 currentcolor; }
          87%        { box-shadow:  0.2em -0.2em 0 0 currentcolor; }
        }
      `}</style>
    </div>
  );
}
