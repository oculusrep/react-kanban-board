import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const location = useLocation();

  const linkClass = (path: string) =>
    `px-4 py-2 rounded hover:bg-blue-100 ${
      location.pathname === path ? "bg-blue-200 font-semibold" : ""
    }`;

  return (
    <nav className="bg-white shadow p-4 flex space-x-4">
      <Link to="/master-pipeline" className={linkClass("/master-pipeline")}>
        Master Pipeline
      </Link>
      <Link to="/deal-test" className={linkClass("/deal-test")}>
        Test Deal
      </Link>
    </nav>
  );
}
