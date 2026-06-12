import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { adminFetch } from "@/lib/api";
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

interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    staffRoleId: number | null;
    permissions: string[];
  };
}

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const loginMutation = useMutation({
    mutationFn: (data: LoginFormValues) =>
      adminFetch<AuthResponse>("/auth/admin/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  });

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      credential: "",
      password: "",
    },
  });

  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(data, {
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
      onError: (err: Error) => {
        toast({
          title: t("auth.loginFailed"),
          description: err.message || t("auth.checkCredentials"),
          variant: "destructive",
        });
      },
    });
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
                    <FormLabel>{t('auth.emailOrPhone')}</FormLabel>
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
                    <FormLabel>{t('auth.password')}</FormLabel>
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
                    {t('auth.signingIn')}
                  </>
                ) : (
                  t('auth.signIn')
                )}
              </Button>

            </form>
          </Form>

        </div>
      </div>
    </div>
  );
}
