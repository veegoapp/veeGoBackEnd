import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="text-center p-8 bg-card border border-border rounded-xl shadow-lg max-w-md w-full">
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center">
            <AlertCircle className="h-8 w-8" />
          </div>
        </div>
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <h2 className="text-xl font-semibold mb-4 text-muted-foreground">{t("notFound.title", "Route Not Found")}</h2>
        <p className="text-sm mb-8 text-muted-foreground">
          {t("notFound.desc", "The requested system module does not exist or you do not have authorization to view it.")}
        </p>
        <Button asChild className="w-full">
          <Link href="/dashboard">{t("notFound.returnDashboard", "Return to Dashboard")}</Link>
        </Button>
      </div>
    </div>
  );
}
