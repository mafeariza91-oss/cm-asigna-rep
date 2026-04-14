export const metadata = {
  title: "Asignador de Reps · City Moonlight",
  description: "Asignación de cuentas a reps de ventas",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", background: "#F5F6F8", color: "#1A2F4E" }}>
        {children}
      </body>
    </html>
  );
}
