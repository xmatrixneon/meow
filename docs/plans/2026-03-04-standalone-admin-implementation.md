# Standalone Admin App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a standalone Next.js admin application for managing the meowsms virtual number service with email/password authentication.

**Architecture:** Separate Next.js app in `meowsms-admin/` directory, connecting to the same PostgreSQL database as the main app. Uses Better Auth for email/password authentication with flag-based admin access control.

**Tech Stack:** Next.js 16, Better Auth, Prisma, tRPC, shadcn/ui, Tailwind CSS, TypeScript

---

## Phase 1: Project Setup

### Task 1: Create admin app directory structure

**Files:**
- Create: `meowsms-admin/package.json`
- Create: `meowsms-admin/tsconfig.json`
- Create: `meowsms-admin/next.config.mjs`
- Create: `meowsms-admin/.env.local.example`
- Create: `meowsms-admin/tailwind.config.ts`

**Step 1: Create package.json**

```bash
mkdir -p meowsms-admin
```

**Step 2: Write package.json**

```bash
cat > meowsms-admin/package.json << 'EOF'
{
  "name": "meowsms-admin",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@prisma/adapter-pg": "^6.0.0",
    "@prisma/client": "^6.0.0",
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-dropdown-menu": "^2.1.4",
    "@radix-ui/react-label": "^2.1.1",
    "@radix-ui/react-slot": "^1.1.1",
    "@radix-ui/react-toast": "^1.2.4",
    "@tanstack/react-table": "^8.20.5",
    "@trpc/client": "^11.0.0",
    "@trpc/react-query": "^11.0.0",
    "@trpc/server": "^11.0.0",
    "better-auth": "^1.1.13",
    "better-auth/adapters": "^1.1.13",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "framer-motion": "^11.15.0",
    "lucide-react": "^0.468.0",
    "next": "16.1.6",
    "next-themes": "^0.4.4",
    "pg": "^8.13.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.54.2",
    "superjson": "^2.2.2",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/pg": "^8.11.10",
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.2",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.17.0",
    "postcss": "^8.4.49",
    "prisma": "^6.0.0",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2"
  }
}
EOF
```

**Step 3: Write tsconfig.json**

```bash
cat > meowsms-admin/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF
```

**Step 4: Write next.config.mjs**

```bash
cat > meowsms-admin/next.config.mjs << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
EOF
```

**Step 5: Write .env.local.example**

```bash
cat > meowsms-admin/.env.local.example << 'EOF'
DATABASE_URL="postgresql://user:password@host:5432/dbname"
NEXT_PUBLIC_ADMIN_URL="http://localhost:3001"
BETTER_AUTH_SECRET="your-secret-key-here"
EOF
```

**Step 6: Write tailwind.config.ts**

```bash
cat > meowsms-admin/tailwind.config.ts << 'EOF'
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
EOF
```

**Step 7: Write postcss.config.js**

```bash
cat > meowsms-admin/postcss.config.js << 'EOF'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
EOF
```

**Step 8: Write .gitignore**

```bash
cat > meowsms-admin/.gitignore << 'EOF'
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files
.env*.local
.env

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
EOF
```

**Step 9: Commit**

```bash
cd meowsms-admin && git init && git add . && git commit -m "chore: initial project setup for admin app"
```

---

### Task 2: Setup Prisma with shared schema

**Files:**
- Create: `meowsms-admin/prisma/schema.prisma`
- Modify: `meowsms-admin/package.json` (add prisma generate script)
- Test: N/A (no tests for schema)

**Step 1: Copy schema from main app**

```bash
cp ../prisma/schema.prisma meowsms-admin/prisma/schema.prisma
```

**Step 2: Update package.json with prisma scripts**

```bash
cd meowsms-admin && npm pkg set scripts.prisma="prisma" scripts.generate="prisma generate" scripts.migrate="prisma migrate dev"
```

**Step 3: Create prisma client lib**

```bash
cat > meowsms-admin/lib/db.ts << 'EOF'
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
EOF
```

**Step 4: Generate Prisma client**

```bash
cd meowsms-admin && npm run generate
```

**Step 5: Commit**

```bash
cd meowsms-admin && git add prisma/ lib/db.ts package.json && git commit -m "chore: setup Prisma with shared schema"
```

---

## Phase 2: Authentication System

### Task 3: Setup Better Auth

**Files:**
- Create: `meowsms-admin/lib/auth-admin.ts`
- Create: `meowsms-admin/app/api/auth/[...all]/route.ts`
- Test: N/A (manual testing)

**Step 1: Create Better Auth config**

```bash
cat > meowsms-admin/lib/auth-admin.ts << 'EOF'
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";

const baseURL = process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3001";
if (!baseURL) throw new Error("NEXT_PUBLIC_ADMIN_URL must be set");

export const auth = betterAuth({
  baseURL,
  trustedOrigins: [
    baseURL,
    "http://localhost:3001",
  ],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,
  },
});

export type AdminAuth = typeof auth;
EOF
```

**Step 2: Create auth API handler**

```bash
mkdir -p meowsms-admin/app/api/auth/\[...all\]
```

```bash
cat > meowsms-admin/app/api/auth/\[...all\]/route.ts << 'EOF'
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth-admin";

export const { GET, POST } = toNextJsHandler(auth.handler);
EOF
```

**Step 3: Create auth client**

```bash
cat > meowsms-admin/lib/auth-client.ts << 'EOF'
import { createAuthClient } from "better-auth/react";
import type { AdminAuth } from "./auth-admin";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3001",
});

export const { signIn, signUp, signOut, useSession } = authClient;
EOF
```

**Step 4: Commit**

```bash
cd meowsms-admin && git add lib/auth-admin.ts lib/auth-client.ts app/api/auth/ && git commit -m "feat: setup Better Auth for admin app"
```

---

### Task 4: Create middleware for route protection

**Files:**
- Create: `meowsms-admin/middleware.ts`

**Step 1: Create middleware**

```bash
cat > meowsms-admin/middleware.ts << 'EOF'
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "./lib/auth-admin";

export async function middleware(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login") ||
                      request.nextUrl.pathname.startsWith("/signup");
  const isAdminRoute = request.nextUrl.pathname.startsWith("/dashboard");

  // If not authenticated and trying to access admin routes
  if (isAdminRoute && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If authenticated but not admin and trying to access admin routes
  if (isAdminRoute && session && !session.user.isAdmin) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  // If authenticated and trying to access auth routes
  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};
EOF
```

**Step 2: Commit**

```bash
cd meowsms-admin && git add middleware.ts && git commit -m "feat: add middleware for route protection"
```

---

### Task 5: Create login page

**Files:**
- Create: `meowsms-admin/app/(auth)/login/page.tsx`

**Step 1: Create login page**

```bash
mkdir -p meowsms-admin/app/\(auth\)/login
```

```bash
cat > meowsms-admin/app/\(auth\)/login/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signIn.email({
        email,
        password,
      });
      router.push("/dashboard");
    } catch (err) {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Admin Login</CardTitle>
          <CardDescription>Sign in to access the admin dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
EOF
```

**Step 2: Commit**

```bash
cd meowsms-admin && git add app/\(auth\)/login/page.tsx && git commit -m "feat: add login page"
```

---

### Task 6: Create signup page

**Files:**
- Create: `meowsms-admin/app/(auth)/signup/page.tsx`

**Step 1: Create signup page**

```bash
mkdir -p meowsms-admin/app/\(auth\)/signup
```

```bash
cat > meowsms-admin/app/\(auth\)/signup/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signUp.email({
        email,
        password,
        name,
      });
      router.push("/dashboard");
    } catch (err) {
      setError("Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create Admin Account</CardTitle>
          <CardDescription>Sign up to access the admin dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Admin Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Sign Up"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
EOF
```

**Step 2: Commit**

```bash
cd meowsms-admin && git add app/\(auth\)/signup/page.tsx && git commit -m "feat: add signup page"
```

---

## Phase 3: UI Components

### Task 7: Setup shadcn/ui components

**Files:**
- Create: `meowsms-admin/components/ui/button.tsx`
- Create: `meowsms-admin/components/ui/input.tsx`
- Create: `meowsms-admin/components/ui/label.tsx`
- Create: `meowsms-admin/components/ui/card.tsx`
- Create: `meowsms-admin/components/ui/table.tsx`
- Create: `meowsms-admin/components/ui/dialog.tsx`
- Create: `meowsms-admin/components/ui/dropdown-menu.tsx`
- Create: `meowsms-admin/components/ui/toast.tsx`
- Create: `meowsms-admin/components/ui/toaster.tsx`
- Create: `meowsms-admin/components/ui/use-toast.ts`
- Create: `meowsms-admin/components/ui/select.tsx`
- Create: `meowsms-admin/components/ui/separator.tsx`

**Step 1: Create UI components directory**

```bash
mkdir -p meowsms-admin/components/ui
```

**Step 2: Create button component**

```bash
cat > meowsms-admin/components/ui/button.tsx << 'EOF'
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
EOF
```

**Step 3: Create input component**

```bash
cat > meowsms-admin/components/ui/input.tsx << 'EOF'
import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
EOF
```

**Step 4: Create label component**

```bash
cat > meowsms-admin/components/ui/label.tsx << 'EOF'
import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
EOF
```

**Step 5: Create card component**

```bash
cat > meowsms-admin/components/ui/card.tsx << 'EOF'
import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
EOF
```

**Step 6: Create table component**

```bash
cat > meowsms-admin/components/ui/table.tsx << 'EOF'
import * as React from "react";
import { cn } from "@/lib/utils";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => (
  <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => (
  <tr ref={ref} className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)} {...props} />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <th ref={ref} className={cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className)} {...props} />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className)} {...props} />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLCaptionHTMLAttributes<HTMLTableCaptionElement>>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
EOF
```

**Step 7: Create utils file**

```bash
cat > meowsms-admin/lib/utils.ts << 'EOF'
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
EOF
```

**Step 8: Create global CSS**

```bash
mkdir -p meowsms-admin/app
```

```bash
cat > meowsms-admin/app/globals.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
EOF
```

**Step 9: Commit**

```bash
cd meowsms-admin && git add components/ui/ lib/utils.ts app/globals.css && git commit -m "chore: add shadcn/ui components"
```

---

## Phase 4: Dashboard Layout

### Task 8: Create dashboard layout

**Files:**
- Create: `meowsms-admin/app/(dashboard)/layout.tsx`
- Create: `meowsms-admin/components/admin/admin-sidebar.tsx`
- Create: `meowsms-admin/components/admin/admin-header.tsx`

**Step 1: Create dashboard layout**

```bash
mkdir -p meowsms-admin/app/\(dashboard\)
```

```bash
cat > meowsms-admin/app/\(dashboard\)/layout.tsx << 'EOF'
"use client";

import { useSession, signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AdminSidebar from "@/components/admin/admin-sidebar";
import AdminHeader from "@/components/admin/admin-header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!session?.user?.isAdmin) {
    return null;
  }

  return (
    <div className="flex h-screen bg-muted/40">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AdminHeader />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
EOF
```

**Step 2: Create admin sidebar**

```bash
mkdir -p meowsms-admin/components/admin
```

```bash
cat > meowsms-admin/components/admin/admin-sidebar.tsx << 'EOF'
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Receipt,
  Smartphone,
  Server,
  Tag,
  Settings,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/users", label: "Users", icon: Users },
  { href: "/dashboard/transactions", label: "Transactions", icon: Receipt },
  { href: "/dashboard/numbers", label: "Numbers", icon: Smartphone },
  { href: "/dashboard/services", label: "Services", icon: Server },
  { href: "/dashboard/promocodes", label: "Promocodes", icon: Tag },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold">MeowSMS Admin</h1>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
EOF
```

**Step 3: Create admin header**

```bash
cat > meowsms-admin/components/admin/admin-header.tsx << 'EOF'
"use client";

import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";

export default function AdminHeader() {
  const { data: session } = useSession();

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6">
      <div className="flex items-center gap-2">
        <User size={20} className="text-muted-foreground" />
        <span className="text-sm font-medium">{session?.user?.name || session?.user?.email}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => signOut()}>
        <LogOut size={16} className="mr-2" />
        Sign Out
      </Button>
    </header>
  );
}
EOF
```

**Step 4: Create root layout**

```bash
cat > meowsms-admin/app/layout.tsx << 'EOF'
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MeowSMS Admin",
  description: "Admin dashboard for MeowSMS virtual number service",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
EOF
```

**Step 5: Create landing page**

```bash
cat > meowsms-admin/app/page.tsx << 'EOF'
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dashboard");
}
EOF
```

**Step 6: Commit**

```bash
cd meowsms-admin && git add app/\(dashboard\)/layout.tsx app/layout.tsx app/page.tsx components/admin/ && git commit -m "feat: add dashboard layout with sidebar and header"
```

---

## Phase 5: API Routes (tRPC)

### Task 9: Setup tRPC

**Files:**
- Create: `meowsms-admin/lib/trpc/server.ts`
- Create: `meowsms-admin/lib/trpc/client.ts`
- Create: `meowsms-admin/lib/trpc/routers/index.ts`

**Step 1: Create tRPC server**

```bash
mkdir -p meowsms-admin/lib/trpc/routers
```

```bash
cat > meowsms-admin/lib/trpc/server.ts << 'EOF'
import { initTRPC } from "@trpc/server";
import { superjson } from "superjson";
import type { AdminAuth } from "@/lib/auth-admin";
import { auth as betterAuth } from "@/lib/auth-admin";

const createTRPCContext = async () => {
  const session = await betterAuth.api.getSession({
    headers: new Headers(),
  });

  return {
    session,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user?.isAdmin) {
    throw new Error("Unauthorized");
  }
  return next({ ctx: { ...ctx, user: ctx.session.user } });
});

export { adminProcedure };
EOF
```

**Step 2: Create tRPC client**

```bash
cat > meowsms-admin/lib/trpc/client.ts << 'EOF'
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState } from "react";
import superjson from "superjson";

export const trpc = createTRPCReact<import("./server").AppRouter>();

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: process.env.NEXT_PUBLIC_ADMIN_URL
            ? `${process.env.NEXT_PUBLIC_ADMIN_URL}/api/trpc`
            : "http://localhost:3001/api/trpc",
          transformer: superjson,
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
EOF
```

**Step 3: Create tRPC router index**

```bash
cat > meowsms-admin/lib/trpc/routers/index.ts << 'EOF'
import { createTRPCRouter } from "../server";
import { adminRouter } from "./admin";

export const appRouter = createTRPCRouter({
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
EOF
```

**Step 4: Update dashboard layout to include TRPCProvider**

```bash
cd meowsms-admin && sed -i '5aimport { TRPCProvider } from "@/lib/trpc/client";' app/\(dashboard\)/layout.tsx
cd meowsms-admin && sed -i 's/return (/return (\n    <TRPCProvider>/' app/\(dashboard\)/layout.tsx
cd meowsms-admin && sed -i '$s/    <main/<\/TRPCProvider>\n    <main/' app/\(dashboard\)/layout.tsx
cd meowsms-admin && sed -i '$s/    <\/main>/<\/main>\n  <\/TRPCProvider>/' app/\(dashboard\)/layout.tsx
```

**Step 5: Commit**

```bash
cd meowsms-admin && git add lib/trpc/ app/\(dashboard\)/layout.tsx && git commit -m "feat: setup tRPC server and client"
```

---

### Task 10: Create admin tRPC router

**Files:**
- Create: `meowsms-admin/lib/trpc/routers/admin.ts`
- Create: `meowsms-admin/app/api/trpc/[trpc]/route.ts`

**Step 1: Copy admin router from main app**

```bash
cat > meowsms-admin/lib/trpc/routers/admin.ts << 'EOF'
import { createTRPCRouter, adminProcedure } from "../server";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Stats
export const adminRouter = createTRPCRouter({
  // Dashboard stats
  stats: adminProcedure.query(async () => {
    const [totalUsers, totalServices, totalServers, activeNumbers, totalRevenue] = await Promise.all([
      prisma.user.count(),
      prisma.service.count({ where: { isActive: true } }),
      prisma.otpServer.count({ where: { isActive: true } }),
      prisma.activeNumber.count({
        where: { status: "PENDING", activeStatus: "ACTIVE" },
      }),
      prisma.transaction.aggregate({
        where: { type: { in: ["PURCHASE", "REFUND"] } },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalUsers,
      totalServices,
      totalServers,
      activeNumbers,
      totalRevenue: totalRevenue._sum.amount || 0,
    };
  }),

  // Users
  getUsers: adminProcedure
    .input(z.object({ search: z.string().optional(), page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const where = input.search
        ? {
            OR: [
              { email: { contains: input.search, mode: "insensitive" as const } },
              { telegramUsername: { contains: input.search, mode: "insensitive" as const } },
            ],
          }
        : {};

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip: (input.page - 1) * input.limit,
          take: input.limit,
          include: {
            wallet: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.user.count({ where }),
      ]);

      return { users, total, page: input.page, limit: input.limit };
    }),

  getUser: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    return prisma.user.findUnique({
      where: { id: input.id },
      include: {
        wallet: true,
        numbers: { take: 10, orderBy: { createdAt: "desc" } },
        promoHistory: { take: 10, include: { promocode: true }, orderBy: { createdAt: "desc" } },
      },
    });
  }),

  updateUser: adminProcedure
    .input(z.object({
      id: z.string(),
      isAdmin: z.boolean().optional(),
      balanceAdjustment: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.user.findUnique({ where: { id: input.id } });
      if (!user) throw new Error("User not found");

      const updateData: any = {};
      if (input.isAdmin !== undefined) updateData.isAdmin = input.isAdmin;

      if (input.balanceAdjustment && user.wallet) {
        await prisma.wallet.update({
          where: { userId: input.id },
          data: { balance: { increment: input.balanceAdjustment } },
        });

        await prisma.transaction.create({
          data: {
            walletId: user.wallet.id,
            type: "ADJUSTMENT",
            amount: input.balanceAdjustment,
            status: "COMPLETED",
            description: "Admin balance adjustment",
          },
        });
      }

      return prisma.user.update({
        where: { id: input.id },
        data: updateData,
      });
    }),

  // Transactions
  getTransactions: adminProcedure
    .input(z.object({
      type: z.enum(["DEPOSIT", "PURCHASE", "REFUND", "PROMO"]).optional(),
      status: z.enum(["PENDING", "COMPLETED", "FAILED"]).optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const where: any = {};
      if (input.type) where.type = input.type;
      if (input.status) where.status = input.status;

      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
          skip: (input.page - 1) * input.limit,
          take: input.limit,
          include: { wallet: { include: { user: true } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.transaction.count({ where }),
      ]);

      return { transactions, total, page: input.page, limit: input.limit };
    }),

  // Numbers
  getNumbers: adminProcedure
    .input(z.object({
      status: z.enum(["PENDING", "COMPLETED", "CANCELLED"]).optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const where: any = {};
      if (input.status) where.status = input.status;

      const [numbers, total] = await Promise.all([
        prisma.activeNumber.findMany({
          where,
          skip: (input.page - 1) * input.limit,
          take: input.limit,
          include: { user: true, service: true, server: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.activeNumber.count({ where }),
      ]);

      return { numbers, total, page: input.page, limit: input.limit };
    }),

  // Services
  getServices: adminProcedure.query(async () => {
    return prisma.service.findMany({
      include: { server: true },
      orderBy: { name: "asc" },
    });
  }),

  createService: adminProcedure
    .input(z.object({
      code: z.string(),
      name: z.string(),
      serverId: z.string(),
      basePrice: z.number(),
      iconUrl: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      return prisma.service.create({ data: input });
    }),

  updateService: adminProcedure
    .input(z.object({
      id: z.string(),
      code: z.string().optional(),
      name: z.string().optional(),
      basePrice: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return prisma.service.update({ where: { id }, data });
    }),

  deleteService: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    return prisma.service.delete({ where: { id: input.id } });
  }),

  // Servers
  getServers: adminProcedure.query(async () => {
    return prisma.otpServer.findMany({
      orderBy: { name: "asc" },
    });
  }),

  createServer: adminProcedure
    .input(z.object({
      name: z.string(),
      countryCode: z.string(),
      countryIso: z.string(),
      countryName: z.string(),
      apiId: z.string(),
      apiUrl: z.string(),
      apiKey: z.string(),
    }))
    .mutation(async ({ input }) => {
      return prisma.otpServer.create({
        data: {
          ...input,
          apiCredential: {
            create: {
              name: input.name,
              apiUrl: input.apiUrl,
              apiKey: input.apiKey,
            },
          },
        },
      });
    }),

  updateServer: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return prisma.otpServer.update({ where: { id }, data });
    }),

  deleteServer: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    return prisma.otpServer.delete({ where: { id: input.id } });
  }),

  // Promocodes
  getPromocodes: adminProcedure.query(async () => {
    return prisma.promocode.findMany({
      orderBy: { createdAt: "desc" },
    });
  }),

  createPromocode: adminProcedure
    .input(z.object({
      code: z.string(),
      amount: z.number(),
      maxUses: z.number(),
    }))
    .mutation(async ({ input }) => {
      return prisma.promocode.create({ data: input });
    }),

  updatePromocode: adminProcedure
    .input(z.object({
      id: z.string(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return prisma.promocode.update({ where: { id }, data });
    }),

  deletePromocode: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    return prisma.promocode.delete({ where: { id: input.id } });
  }),

  // Settings
  getSettings: adminProcedure.query(async () => {
    return prisma.settings.findUnique({ where: { id: "1" } });
  }),

  updateSettings: adminProcedure
    .input(z.object({
      bharatpeMerchantId: z.string().nullable().optional(),
      bharatpeToken: z.string().nullable().optional(),
      bharatpeQrImage: z.string().nullable().optional(),
      minRechargeAmount: z.number().optional(),
      maxRechargeAmount: z.number().optional(),
      upiId: z.string().nullable().optional(),
      referralPercent: z.number().optional(),
      minRedeem: z.number().optional(),
      numberExpiryMinutes: z.number().optional(),
      maintenanceMode: z.boolean().optional(),
      telegramHelpUrl: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      return prisma.settings.upsert({
        where: { id: "1" },
        update: input,
        create: { id: "1", ...input },
      });
    }),
});
EOF
```

**Step 2: Create tRPC API route**

```bash
mkdir -p meowsms-admin/app/api/trpc/\[trpc\]
```

```bash
cat > meowsms-admin/app/api/trpc/\[trpc\]/route.ts << 'EOF'
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/lib/trpc/routers";

const handler = (req: Request) =>
  fetchRequestHandler({
    req,
    router: appRouter,
    createContext: () => ({}),
    endpoint: "/api/trpc",
  });

export { handler as GET, handler as POST };
EOF
```

**Step 3: Commit**

```bash
cd meowsms-admin && git add lib/trpc/routers/admin.ts app/api/trpc/ && git commit -m "feat: add admin tRPC router"
```

---

## Phase 6: Dashboard Pages

### Task 11: Create dashboard home page

**Files:**
- Create: `meowsms-admin/app/(dashboard)/dashboard/page.tsx`

**Step 1: Create dashboard page**

```bash
mkdir -p meowsms-admin/app/\(dashboard\)/dashboard
```

```bash
cat > meowsms-admin/app/\(dashboard\)/dashboard/page.tsx << 'EOF'
"use client";

import { trpc } from "@/lib/trpc/client";
import { Users, Smartphone, Server, Receipt, DollarSign } from "lucide-react";

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center gap-4">
        <div className={`${color} p-3 rounded-lg`}>
          <Icon size={24} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? (
            <p className="text-2xl font-bold">...</p>
          ) : (
            <p className="text-2xl font-bold">{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: stats, isLoading } = trpc.admin.stats.useQuery();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your virtual number service</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={stats?.totalUsers || 0}
          icon={Users}
          color="text-blue-500 bg-blue-500/10"
          loading={isLoading}
        />
        <StatCard
          title="Active Orders"
          value={stats?.activeNumbers || 0}
          icon={Smartphone}
          color="text-amber-500 bg-amber-500/10"
          loading={isLoading}
        />
        <StatCard
          title="Services"
          value={stats?.totalServices || 0}
          icon={Server}
          color="text-purple-500 bg-purple-500/10"
          loading={isLoading}
        />
        <StatCard
          title="Servers"
          value={stats?.totalServers || 0}
          icon={Server}
          color="text-cyan-500 bg-cyan-500/10"
          loading={isLoading}
        />
        <StatCard
          title="Revenue"
          value={formatCurrency(Number(stats?.totalRevenue || 0))}
          icon={DollarSign}
          color="text-green-500 bg-green-500/10"
          loading={isLoading}
        />
      </div>
    </div>
  );
}
EOF
```

**Step 2: Commit**

```bash
cd meowsms-admin && git add app/\(dashboard\)/dashboard/page.tsx && git commit -m "feat: add dashboard home page with stats"
```

---

### Task 12: Create users page

**Files:**
- Create: `meowsms-admin/app/(dashboard)/users/page.tsx`

**Step 1: Create users page**

```bash
mkdir -p meowsms-admin/app/\(dashboard\)/users
```

```bash
cat > meowsms-admin/app/\(dashboard\)/users/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Shield, Ban } from "lucide-react";

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.admin.getUsers.useQuery({ search, page, limit: 20 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">Manage user accounts</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
          <Input
            placeholder="Search by email or username..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : data?.users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              data?.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>{user.telegramUsername || "-"}</TableCell>
                  <TableCell>₹{user.wallet?.balance || 0}</TableCell>
                  <TableCell>
                    {user.isAdmin && (
                      <Badge variant="default" className="gap-1">
                        <Shield size={12} />
                        Admin
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.total > data.limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * data.limit + 1} to {Math.min(page * data.limit, data.total)} of {data.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="text-sm">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page * data.limit >= data.total}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
EOF
```

**Step 2: Create badge component**

```bash
cat > meowsms-admin/components/ui/badge.tsx << 'EOF'
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
EOF
```

**Step 3: Commit**

```bash
cd meowsms-admin && git add app/\(dashboard\)/users/page.tsx components/ui/badge.tsx && git commit -m "feat: add users page with search and pagination"
```

---

### Task 13: Create transactions page

**Files:**
- Create: `meowsms-admin/app/(dashboard)/transactions/page.tsx`

**Step 1: Create transactions page**

```bash
mkdir -p meowsms-admin/app/\(dashboard\)/transactions
```

```bash
cat > meowsms-admin/app/\(dashboard\)/transactions/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function TransactionsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.admin.getTransactions.useQuery({ page, limit: 20 });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Transactions</h1>
        <p className="text-muted-foreground">Transaction history and deposits</p>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : data?.transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              data?.transactions.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell>{txn.wallet.user.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{txn.type}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(Number(txn.amount))}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={txn.status === "COMPLETED" ? "default" : "secondary"}
                    >
                      {txn.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(txn.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.total > data.limit && (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="px-3 py-1 text-sm rounded border border-border disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm">Page {page}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page * data.limit >= data.total}
            className="px-3 py-1 text-sm rounded border border-border disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
EOF
```

**Step 2: Commit**

```bash
cd meowsms-admin && git add app/\(dashboard\)/transactions/page.tsx && git commit -m "feat: add transactions page"
```

---

### Task 14: Create numbers page

**Files:**
- Create: `meowsms-admin/app/(dashboard)/numbers/page.tsx`

**Step 1: Create numbers page**

```bash
mkdir -p meowsms-admin/app/\(dashboard\)/numbers
```

```bash
cat > meowsms-admin/app/\(dashboard\)/numbers/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function NumbersPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.admin.getNumbers.useQuery({ page, limit: 20 });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Numbers</h1>
        <p className="text-muted-foreground">Phone number orders</p>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phone</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : data?.numbers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No orders found
                </TableCell>
              </TableRow>
            ) : (
              data?.numbers.map((num) => (
                <TableRow key={num.id}>
                  <TableCell className="font-medium">{num.phoneNumber}</TableCell>
                  <TableCell>{num.service.name}</TableCell>
                  <TableCell>{num.user.email}</TableCell>
                  <TableCell>{formatCurrency(Number(num.price))}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        num.status === "COMPLETED"
                          ? "default"
                          : num.status === "PENDING"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {num.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(num.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.total > data.limit && (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="px-3 py-1 text-sm rounded border border-border disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm">Page {page}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page * data.limit >= data.total}
            className="px-3 py-1 text-sm rounded border border-border disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
EOF
```

**Step 2: Commit**

```bash
cd meowsms-admin && git add app/\(dashboard\)/numbers/page.tsx && git commit -m "feat: add numbers page"
```

---

### Task 15: Create services page

**Files:**
- Create: `meowsms-admin/app/(dashboard)/services/page.tsx`

**Step 1: Create services page**

```bash
mkdir -p meowsms-admin/app/\(dashboard\)/services
```

```bash
cat > meowsms-admin/app/\(dashboard\)/services/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ServicesPage() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [serverId, setServerId] = useState("");
  const [price, setPrice] = useState("");

  const { data: services, isLoading, refetch } = trpc.admin.getServices.useQuery();
  const { data: servers } = trpc.admin.getServers.useQuery();

  const createMutation = trpc.admin.createService.useMutation({
    onSuccess: () => {
      setOpen(false);
      setCode("");
      setName("");
      setServerId("");
      setPrice("");
      refetch();
    },
  });

  const deleteMutation = trpc.admin.deleteService.useMutation({
    onSuccess: () => refetch(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      code,
      name,
      serverId,
      basePrice: parseFloat(price),
      iconUrl: null,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Services</h1>
          <p className="text-muted-foreground">Manage available services</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus size={16} className="mr-2" />
              Add Service
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Service</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="server">Server</Label>
                <select
                  id="server"
                  value={serverId}
                  onChange={(e) => setServerId(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2"
                  required
                >
                  <option value="">Select server</option>
                  {servers?.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Base Price (₹)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Service"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Server</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : services?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No services found
                </TableCell>
              </TableRow>
            ) : (
              services?.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium">{service.code}</TableCell>
                  <TableCell>{service.name}</TableCell>
                  <TableCell>{service.server.name}</TableCell>
                  <TableCell>₹{service.basePrice}</TableCell>
                  <TableCell>
                    <Badge variant={service.isActive ? "default" : "outline"}>
                      {service.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate({ id: service.id })}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
EOF
```

**Step 2: Commit**

```bash
cd meowsms-admin && git add app/\(dashboard\)/services/page.tsx && git commit -m "feat: add services page with CRUD"
```

---

### Task 16: Create servers page

**Files:**
- Create: `meowsms-admin/app/(dashboard)/servers/page.tsx`

**Step 1: Create servers page**

```bash
mkdir -p meowsms-admin/app/\(dashboard\)/servers
```

```bash
cat > meowsms-admin/app/\(dashboard\)/servers/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ServersPage() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [countryIso, setCountryIso] = useState("");
  const [countryName, setCountryName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const { data: servers, isLoading, refetch } = trpc.admin.getServers.useQuery();

  const createMutation = trpc.admin.createServer.useMutation({
    onSuccess: () => {
      setOpen(false);
      setName("");
      setCountryCode("");
      setCountryIso("");
      setCountryName("");
      setApiUrl("");
      setApiKey("");
      refetch();
    },
  });

  const deleteMutation = trpc.admin.deleteServer.useMutation({
    onSuccess: () => refetch(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name,
      countryCode,
      countryIso,
      countryName,
      apiId: countryCode,
      apiUrl,
      apiKey,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Servers</h1>
          <p className="text-muted-foreground">Manage API servers</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus size={16} className="mr-2" />
              Add Server
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Server</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="countryCode">Country Code</Label>
                <Input id="countryCode" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="countryIso">Country ISO</Label>
                <Input id="countryIso" value={countryIso} onChange={(e) => setCountryIso(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="countryName">Country Name</Label>
                <Input id="countryName" value={countryName} onChange={(e) => setCountryName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apiUrl">API URL</Label>
                <Input id="apiUrl" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input id="apiKey" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Server"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : servers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No servers found
                </TableCell>
              </TableRow>
            ) : (
              servers?.map((server) => (
                <TableRow key={server.id}>
                  <TableCell className="font-medium">{server.name}</TableCell>
                  <TableCell>
                    {server.countryFlag} {server.countryName} ({server.countryIso})
                  </TableCell>
                  <TableCell>
                    <Badge variant={server.isActive ? "default" : "outline"}>
                      {server.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate({ id: server.id })}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
EOF
```

**Step 2: Commit**

```bash
cd meowsms-admin && git add app/\(dashboard\)/servers/page.tsx && git commit -m "feat: add servers page with CRUD"
```

---

### Task 17: Create promocodes page

**Files:**
- Create: `meowsms-admin/app/(dashboard)/promocodes/page.tsx`

**Step 1: Create promocodes page**

```bash
mkdir -p meowsms-admin/app/\(dashboard\)/promocodes
```

```bash
cat > meowsms-admin/app/\(dashboard\)/promocodes/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PromocodesPage() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [maxUses, setMaxUses] = useState("1");

  const { data: promocodes, isLoading, refetch } = trpc.admin.getPromocodes.useQuery();

  const createMutation = trpc.admin.createPromocode.useMutation({
    onSuccess: () => {
      setOpen(false);
      setCode("");
      setAmount("");
      setMaxUses("1");
      refetch();
    },
  });

  const deleteMutation = trpc.admin.deletePromocode.useMutation({
    onSuccess: () => refetch(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      code,
      amount: parseFloat(amount),
      maxUses: parseInt(maxUses),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Promocodes</h1>
          <p className="text-muted-foreground">Manage promotional codes</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus size={16} className="mr-2" />
              Add Promocode
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Promocode</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxUses">Max Uses</Label>
                <Input
                  id="maxUses"
                  type="number"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Promocode"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Uses</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : promocodes?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No promocodes found
                </TableCell>
              </TableRow>
            ) : (
              promocodes?.map((promo) => (
                <TableRow key={promo.id}>
                  <TableCell className="font-medium">{promo.code}</TableCell>
                  <TableCell>₹{promo.amount}</TableCell>
                  <TableCell>
                    {promo.usedCount}/{promo.maxUses}
                  </TableCell>
                  <TableCell>
                    <Badge variant={promo.isActive ? "default" : "outline"}>
                      {promo.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate({ id: promo.id })}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
EOF
```

**Step 2: Commit**

```bash
cd meowsms-admin && git add app/\(dashboard\)/promocodes/page.tsx && git commit -m "feat: add promocodes page with CRUD"
```

---

### Task 18: Create settings page

**Files:**
- Create: `meowsms-admin/app/(dashboard)/settings/page.tsx`

**Step 1: Create settings page**

```bash
mkdir -p meowsms-admin/app/\(dashboard\)/settings
```

```bash
cat > meowsms-admin/app/\(dashboard\)/settings/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  const { data: settings, isLoading, refetch } = trpc.admin.getSettings.useQuery();

  const [bharatpeMerchantId, setBharatpeMerchantId] = useState("");
  const [bharatpeToken, setBharatpeToken] = useState("");
  const [bharatpeQrImage, setBharatpeQrImage] = useState("");
  const [upiId, setUpiId] = useState("");
  const [minRechargeAmount, setMinRechargeAmount] = useState("");
  const [maxRechargeAmount, setMaxRechargeAmount] = useState("");
  const [referralPercent, setReferralPercent] = useState("");
  const [numberExpiryMinutes, setNumberExpiryMinutes] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [telegramHelpUrl, setTelegramHelpUrl] = useState("");

  const updateMutation = trpc.admin.updateSettings.useMutation({
    onSuccess: () => refetch(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      bharatpeMerchantId,
      bharatpeToken,
      bharatpeQrImage,
      upiId,
      minRechargeAmount: parseFloat(minRechargeAmount),
      maxRechargeAmount: parseFloat(maxRechargeAmount),
      referralPercent: parseFloat(referralPercent),
      numberExpiryMinutes: parseInt(numberExpiryMinutes),
      maintenanceMode,
      telegramHelpUrl,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your application</p>
      </div>

      {isLoading ? (
        <p>Loading settings...</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Configuration</CardTitle>
              <CardDescription>Configure BharatPe payment integration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="merchantId">Merchant ID</Label>
                <Input
                  id="merchantId"
                  defaultValue={settings?.bharatpeMerchantId || ""}
                  onChange={(e) => setBharatpeMerchantId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="token">Token</Label>
                <Input
                  id="token"
                  type="password"
                  defaultValue={settings?.bharatpeToken || ""}
                  onChange={(e) => setBharatpeToken(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qrImage">QR Image URL</Label>
                <Input
                  id="qrImage"
                  defaultValue={settings?.bharatpeQrImage || ""}
                  onChange={(e) => setBharatpeQrImage(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="upiId">UPI ID</Label>
                <Input
                  id="upiId"
                  defaultValue={settings?.upiId || ""}
                  onChange={(e) => setUpiId(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recharge Limits</CardTitle>
              <CardDescription>Set minimum and maximum recharge amounts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="minRecharge">Minimum Recharge (₹)</Label>
                <Input
                  id="minRecharge"
                  type="number"
                  step="0.01"
                  defaultValue={settings?.minRechargeAmount || 10}
                  onChange={(e) => setMinRechargeAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxRecharge">Maximum Recharge (₹)</Label>
                <Input
                  id="maxRecharge"
                  type="number"
                  step="0.01"
                  defaultValue={settings?.maxRechargeAmount || 5000}
                  onChange={(e) => setMaxRechargeAmount(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Application-wide settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="referralPercent">Referral Percentage</Label>
                <Input
                  id="referralPercent"
                  type="number"
                  step="0.1"
                  defaultValue={settings?.referralPercent || 0}
                  onChange={(e) => setReferralPercent(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiryMinutes">Number Expiry (minutes)</Label>
                <Input
                  id="expiryMinutes"
                  type="number"
                  defaultValue={settings?.numberExpiryMinutes || 15}
                  onChange={(e) => setNumberExpiryMinutes(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="helpUrl">Telegram Help URL</Label>
                <Input
                  id="helpUrl"
                  defaultValue={settings?.telegramHelpUrl || ""}
                  onChange={(e) => setTelegramHelpUrl(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="maintenanceMode">Maintenance Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Disable the app for maintenance
                  </p>
                </div>
                <Switch
                  id="maintenanceMode"
                  checked={maintenanceMode}
                  onCheckedChange={setMaintenanceMode}
                  defaultChecked={settings?.maintenanceMode || false}
                />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" disabled={updateMutation.isPending} size="lg">
            {updateMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </form>
      )}
    </div>
  );
}
EOF
```

**Step 2: Create switch component**

```bash
cat > meowsms-admin/components/ui/switch.tsx << 'EOF'
import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
EOF
```

**Step 3: Commit**

```bash
cd meowsms-admin && git add app/\(dashboard\)/settings/page.tsx components/ui/switch.tsx && git commit -m "feat: add settings page"
```

---

## Phase 7: Deployment

### Task 19: Create deployment configuration

**Files:**
- Create: `meowsms-admin/vercel.json`
- Create: `meowsms-admin/.env.local.example`

**Step 1: Create vercel.json**

```bash
cat > meowsms-admin/vercel.json << 'EOF'
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs"
}
EOF
```

**Step 2: Update .env.local.example**

```bash
cat > meowsms-admin/.env.local.example << 'EOF'
DATABASE_URL="postgresql://user:password@host:5432/dbname"
NEXT_PUBLIC_ADMIN_URL="http://localhost:3001"
BETTER_AUTH_SECRET="your-secret-key-here-generate-with-openssl-rand-base64-32"
EOF
```

**Step 3: Create README**

```bash
cat > meowsms-admin/README.md << 'EOF'
# MeowSMS Admin Panel

Standalone admin dashboard for managing the MeowSMS virtual number service.

## Setup

1. Install dependencies:
\`\`\`bash
npm install
\`\`\`

2. Copy environment variables:
\`\`\`bash
cp .env.local.example .env.local
\`\`\`

3. Configure environment variables in `.env.local`:
- `DATABASE_URL` - PostgreSQL connection string (same as main app)
- `NEXT_PUBLIC_ADMIN_URL` - Admin app URL (e.g., https://admin.yourdomain.com)
- `BETTER_AUTH_SECRET` - Generate with: \`openssl rand -base64 32\`

4. Generate Prisma client:
\`\`\`bash
npm run generate
\`\`\`

5. Run development server:
\`\`\`bash
npm run dev
\`\`\`

## Initial Admin Setup

After running the app for the first time:

1. Sign up at `/signup` to create an account
2. Run SQL query to set user as admin:
\`\`\`sql
UPDATE "User" SET "isAdmin" = true WHERE email = 'your-email@example.com';
\`\`\`

## Deployment

Deploy to Vercel:

1. Create new Vercel project
2. Set environment variables
3. Deploy

## Features

- User management (view, edit, set admin, balance adjustment)
- Transaction history viewing
- Phone number order management
- Service CRUD operations
- Server management
- Promocode management
- Settings and configuration
EOF
```

**Step 4: Commit**

```bash
cd meowsms-admin && git add vercel.json .env.local.example README.md && git commit -m "chore: add deployment configuration and documentation"
```

---

## Phase 8: Cleanup

### Task 20: Remove existing admin routes from main app

**Files:**
- Modify: Existing admin routes in main app
- Test: Ensure main app still works

**Step 1: Remove admin components from main app**

```bash
rm -rf /home/neo/meowsms/components/admin/
```

**Step 2: Remove admin tRPC router (or keep for reference)**

```bash
# Optionally remove or keep as reference
# rm /home/neo/meowsms/lib/trpc/routers/admin.ts
```

**Step 3: Remove admin pages from main app**

```bash
rm -rf /home/neo/meowsms/app/admin/
```

**Step 4: Update main app CLAUDE.md to reference admin app**

```bash
# Add note to CLAUDE.md about separate admin app
```

**Step 5: Commit**

```bash
cd /home/neo/meowsms && git add -A && git commit -m "chore: remove admin routes from main app (now in separate app)"
```

---

## Summary

Total tasks: 20
- Phase 1: Project Setup (2 tasks)
- Phase 2: Authentication System (4 tasks)
- Phase 3: UI Components (1 task)
- Phase 4: Dashboard Layout (1 task)
- Phase 5: API Routes (2 tasks)
- Phase 6: Dashboard Pages (8 tasks)
- Phase 7: Deployment (1 task)
- Phase 8: Cleanup (1 task)

Estimated completion time: ~2-3 hours for an experienced developer following the plan.
