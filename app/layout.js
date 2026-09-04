import "./globals.css";

export const metadata = {
  title: "Hearing Schedule Dashboard",
  description: "Live dashboard powered by Google Sheets"
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}