import { cn } from "@/lib/utils"

interface ImageQuestionProps {
  imageData: string
  className?: string
}

export function ImageQuestion({ imageData, className }: ImageQuestionProps) {
  return (
    <div className={cn("flex justify-center", className)}>
      <img
        src={imageData}
        alt="Question image"
        className="max-w-full max-h-[60vh] rounded-lg border border-border shadow-md object-contain"
      />
    </div>
  )
}
