import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, Send } from "lucide-react"

interface AnswerInputProps {
  answerType: string
  options?: string[] | null
  onSubmit: (answer: string | number) => void
  disabled?: boolean
  submitted?: boolean
}

export function AnswerInput({
  answerType,
  options,
  onSubmit,
  disabled = false,
  submitted = false,
}: AnswerInputProps) {
  const [textValue, setTextValue] = useState("")
  const [numberValue, setNumberValue] = useState("")

  if (submitted) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-emerald-400">
        <Check className="size-5" />
        <span className="text-lg font-medium">Answer Submitted!</span>
      </div>
    )
  }

  if (answerType === "multiple_choice" && options) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {options.map((option, index) => (
          <Button
            key={index}
            variant="outline"
            className="h-auto min-h-[3rem] whitespace-normal px-4 py-3 text-sm"
            disabled={disabled}
            onClick={() => onSubmit(option)}
          >
            {option}
          </Button>
        ))}
      </div>
    )
  }

  if (answerType === "exact_number" || answerType === "fermi") {
    return (
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="Enter a number..."
          value={numberValue}
          onChange={(e) => setNumberValue(e.target.value)}
          disabled={disabled}
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && numberValue.trim()) {
              onSubmit(Number(numberValue))
            }
          }}
        />
        <Button
          disabled={disabled || !numberValue.trim()}
          onClick={() => onSubmit(Number(numberValue))}
        >
          <Send className="size-4" />
          Submit
        </Button>
      </div>
    )
  }

  // text input (default)
  return (
    <div className="flex gap-2">
      <Input
        type="text"
        placeholder="Type your answer..."
        value={textValue}
        onChange={(e) => setTextValue(e.target.value)}
        disabled={disabled}
        className="flex-1"
        onKeyDown={(e) => {
          if (e.key === "Enter" && textValue.trim()) {
            onSubmit(textValue.trim())
          }
        }}
      />
      <Button
        disabled={disabled || !textValue.trim()}
        onClick={() => onSubmit(textValue.trim())}
      >
        <Send className="size-4" />
        Submit
      </Button>
    </div>
  )
}
