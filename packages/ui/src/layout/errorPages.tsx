import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Button } from "../input";

export function NotFoundPage({ illustration }: { illustration: string }) {
  return (
    <div className="flex flex-col items-center justify-center bg-white px-6 py-24 sm:py-32 lg:px-8">
      <div className="text-center">
        <img
          alt="404 Error Illustration"
          src={illustration}
          className="mx-auto h-128 w-auto"
        />
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Well this is embarrassing...
        </h1>
        <p className="mt-6 text-lg leading-8 text-gray-600">
          Sorry, we couldn't find the page you're looking for.
        </p>
        <p className="text-gray-400">Error 404</p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Button
            label="Go back home"
            style="primary"
            size="medium"
            onClick={() => {
              window.location.href = "/";
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function RouteErrorPage({ illustration }: { illustration: string }) {
  const error = useRouteError();
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  const title = is404 ? "Page not found" : "Something went wrong";
  const message = is404
    ? "Sorry, we couldn't find the page you're looking for."
    : "An unexpected error occurred. Please try again or return home.";
  const statusText = isRouteErrorResponse(error)
    ? `Error ${error.status}${error.statusText ? ` — ${error.statusText}` : ""}`
    : error instanceof Error
      ? error.message
      : "Unknown error";
  const stackTrace = error instanceof Error ? error.stack : null;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-24 sm:py-32 lg:px-8">
      <div className="text-center">
        <img
          alt="Error Illustration"
          src={illustration}
          className="mx-auto h-128 w-auto"
        />
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          {title}
        </h1>
        <p className="mt-6 text-lg leading-8 text-gray-600">{message}</p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Button
            label="Go back home"
            style="primary"
            size="medium"
            onClick={() => {
              window.location.href = "/";
            }}
          />
        </div>
        <p className="mt-1 text-sm text-gray-400">{statusText}</p>
        {stackTrace && (
          <pre className="mt-4 text-xs text-gray-500">{stackTrace}</pre>
        )}
      </div>
    </div>
  );
}
