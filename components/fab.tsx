import { link } from "fs"
import { Plus } from "lucide-react"
import Link from "next/link"

interface fabProps {
  url: string
}

export function Fab({ url }: fabProps ) {
  return (
      <Link href={url} className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:scale-105 transition">
        <Plus size={24} />
      </Link>
  )
}