import "./globals.css";

export const metadata = {
  title: "Meridian Power",
  description: "European wholesale energy market data — DE / FR / IT / ES",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
