import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Navbar() {
  const location = useLocation();
  const { user, signOut } = useAuth();

  const linkClass = (path: string) =>
    `px-4 py-2 rounded hover:bg-blue-100 ${
      location.pathname === path ? "bg-blue-200 font-semibold" : ""
    }`;

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <nav className="bg-white shadow p-4 flex justify-between items-center">
      <div className="flex space-x-4">
        <Link to="/master-pipeline" className={linkClass("/master-pipeline")}>
          Master Pipeline
        </Link>
        <Link to="/property/create" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
          + New Property
        </Link>
      </div>
      
      {user && (
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-600">
            {user.email}
          </span>
          <button
            onClick={handleSignOut}
            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}
