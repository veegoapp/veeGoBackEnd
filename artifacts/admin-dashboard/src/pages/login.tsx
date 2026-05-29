import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import logoUrl from "/logo.png";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const loginSchema = z.object({
  credential: z.string().min(1),
  password: z.string().min(1),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const loginMutation = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      credential: "",
      password: "",
    },
  });

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(
      { data },
      {
        onSuccess: (res) => {
          login(res.accessToken, res.refreshToken ?? "", {
            id: res.user?.id ?? 0,
            name: res.user?.name ?? "",
            email: res.user?.email ?? "",
            role: res.user?.role ?? "admin",
            staffRoleId: res.user?.staffRoleId ?? null,
            permissions: res.user?.permissions ?? [],
          });

          toast({
            title: t("auth.welcomeBack"),
            description: t("auth.loggedIn"),
          });
        },
        onError: () => {
          toast({
            title: t("auth.loginFailed"),
            description: t("auth.checkCredentials"),
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">

      {/* LOGIN CARD */}
      <div className="w-full max-w-md">

        <div className="bg-white border border-gray-200 shadow-xl rounded-2xl p-10">

          {/* LOGO */}
          <div className="flex justify-center mb-8">
            <img
              src={logoUrl}
              alt="Logo"
              className="h-28 w-auto object-contain"
            />
          </div>

          {/* FORM */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              <FormField
                control={form.control}
                name="credential"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email / Phone</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="admin@shuttleops.com"
                        className="h-12"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        {...field}
                        placeholder="••••••••"
                        className="h-12"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-12 rounded-lg"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>

            </form>
          </Form>

        </div>
      </div>
    </div>
  );
}