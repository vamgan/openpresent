import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { slideId: string; children: ReactNode }
interface State { error?: Error }

export class SlideErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[OpenPresent] Slide "${this.props.slideId}" failed to render.`, error, info);
  }

  componentDidUpdate(previous: Props) {
    if (previous.slideId !== this.props.slideId && this.state.error) this.setState({ error: undefined });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="op-slide-error" role="alert">
          <strong>Slide “{this.props.slideId}” could not render.</strong>
          <span>{this.state.error.message}</span>
          <small>Check this slide’s component props and browser console.</small>
        </div>
      );
    }
    return this.props.children;
  }
}
