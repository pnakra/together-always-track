import { Link } from "@tanstack/react-router";

export function DemoFooter() {
  return (
    <footer className="mt-10 pb-10 text-center">
      <Link to="/about" className="text-xs text-muted-foreground underline underline-offset-4">
        About this demo
      </Link>
    </footer>
  );
}
