"use client";

import ErrorPantalla from "@/components/ui/ErrorPantalla";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPantalla error={props.error} reintentar={props.reset} inicio="/tecnico" />;
}
