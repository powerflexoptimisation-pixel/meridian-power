import "./globals.css";

export const metadata = {
  title: "Meridian Power",
  description: "European wholesale energy market data — DE / FR / IT / ES",
};

// Applique le thème stocké AVANT le premier rendu pour éviter un flash
// (sombre -> clair) au chargement de la page.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("mp-theme");
    var theme = stored === "light" || stored === "dark" ? stored : "dark";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
