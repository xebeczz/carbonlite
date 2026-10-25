import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, EmptyState } from "../components/ui";

export function NotFoundPage() {
  return (
    <div className="animate-rise">
      <Card>
        <EmptyState
          icon={Compass}
          title="That page does not exist"
          description="The link may be old, or the document may belong to another business. Head back to a known screen."
          action={
            <>
              <Link to="/" className="btn-secondary">
                Home
              </Link>
              <Link to="/dashboard" className="btn-primary">
                Back to dashboard
              </Link>
            </>
          }
        />
      </Card>
    </div>
  );
}
