import { Component, ReactNode } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert"
import { AlertTriangle } from "lucide-react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Произошла ошибка</AlertTitle>
          <AlertDescription>
            {this.state.error?.message || "Неизвестная ошибка"}
          </AlertDescription>
        </Alert>
      )
    }

    return this.props.children
  }
}
