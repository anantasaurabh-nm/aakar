'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, Lock, Eye, EyeOff, LogIn, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { LoginRequestSchema, type LoginRequest, type LoginResponse } from '@erp/shared-contracts';
import { apiClient, ApiError } from '@/lib/api-client';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const onSubmit = async (values: LoginRequest) => {
    setServerError(null);
    setSubmitting(true);
    try {
      const res = await apiClient.post<LoginResponse>('auth/login', values);
      queryClient.setQueryData(['auth', 'me'], { user: res.user });
      router.push('/');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background:
          'radial-gradient(circle at 20% 20%, rgba(99,102,241,0.08), transparent 40%), radial-gradient(circle at 80% 70%, rgba(6,182,212,0.08), transparent 45%), var(--bg)',
        padding: 24,
      }}
    >
      <div style={{ position: 'absolute', top: 24, right: 24 }}>
        <ThemeToggle />
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border)',
          padding: '40px 36px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid rgba(99,102,241,0.35)',
              color: 'var(--accent-indigo)',
            }}
          >
            <ShieldCheck size={30} />
          </div>
        </div>

        <h1 style={{ textAlign: 'center', fontSize: 26, fontWeight: 800, margin: 0 }}>
          Welcome to{' '}
          <span
            style={{
              background: 'linear-gradient(90deg, var(--accent-indigo), var(--accent-cyan))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            DOERS OS
          </span>
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: 8, marginBottom: 28 }}>
          Enter your credentials
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Email or Username
          </label>
          <div style={{ position: 'relative', margin: '6px 0 16px' }}>
            <Mail size={16} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--text-tertiary)' }} />
            <input
              {...register('identifier')}
              type="text"
              autoComplete="username"
              placeholder="admin@doers-os.internal"
              style={inputStyle}
            />
          </div>
          {errors.identifier && <FieldError message={errors.identifier.message} />}

          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Password</label>
          <div style={{ position: 'relative', margin: '6px 0 8px' }}>
            <Lock size={16} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--text-tertiary)' }} />
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••••••"
              style={{ ...inputStyle, paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: 12,
                top: 11,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password && <FieldError message={errors.password.message} />}

          {serverError && (
            <div
              role="alert"
              style={{
                marginTop: 8,
                marginBottom: 4,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(239,68,68,0.1)',
                color: '#b91c1c',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              marginTop: 20,
              padding: '14px 0',
              borderRadius: 12,
              border: 'none',
              cursor: submitting ? 'default' : 'pointer',
              fontWeight: 700,
              fontSize: 15,
              color: '#fff',
              opacity: submitting ? 0.7 : 1,
              background: 'linear-gradient(90deg, var(--accent-indigo-dark), var(--accent-indigo))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <LogIn size={18} />
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 28, paddingTop: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 18,
              flexWrap: 'wrap',
              color: 'var(--text-secondary)',
              fontSize: 12.5,
            }}
          >
            {['RBAC Active', 'JWT Secured', 'HttpOnly Cookie'].map((label) => (
              <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={14} color="var(--accent-emerald)" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p style={{ color: 'var(--accent-red)', fontSize: 12, margin: '-12px 0 12px' }}>{message}</p>;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px 12px 40px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
};
