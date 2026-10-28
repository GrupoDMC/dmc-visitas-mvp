import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// Los componentes llaman a next/navigation y a Server Actions. Aquí el router
// es un espía compartido (tests/helpers/componentes.tsx) y cada archivo de test
// simula las acciones que su componente usa.
vi.mock("next/navigation", async () => {
  const { router } = await import("../helpers/componentes");
  return {
    useRouter: () => router,
    usePathname: () => "/admin/visitas",
    useSearchParams: () => new URLSearchParams(),
    redirect: vi.fn(),
    notFound: vi.fn(),
  };
});

beforeEach(() => {
  vi.stubGlobal("vi", vi);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

// jsdom no implementa estas APIs que los componentes usan al montar.
window.scrollTo ??= (() => undefined) as typeof window.scrollTo;
Element.prototype.scrollIntoView ??= () => undefined;
window.matchMedia ??= ((consulta: string) =>
  ({ matches: false, media: consulta, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false }) as MediaQueryList);
URL.createObjectURL ??= () => "blob:prueba";
URL.revokeObjectURL ??= () => undefined;
