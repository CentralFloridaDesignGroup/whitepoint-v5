import confusedWorker from "../assets/confused_worker.webp";
import { MarketingButton } from "../components/marketing";

export function ErrorPage() {
    return (
        <div className="flex flex-col items-center justify-center bg-white px-6 py-24 sm:py-32 lg:px-8">
            <div className="text-center">
                <img
                    alt="404 Error Illustration"
                    src={confusedWorker}
                    className="mx-auto h-128 w-auto"
                />
                <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">Well this is embarrassing...</h1>
                <p className="mt-6 text-lg leading-8 text-gray-600">Sorry, we couldn't find the page you're looking for.</p>
                <p className='text-gray-400'>Error 404</p>
                <div className="mt-10 flex items-center justify-center gap-x-6">
                    <MarketingButton
                        label="Go back home"
                        variant="primary"
                        size="medium"
                        onClick={() => window.location.href = "/"}
                    />
                    <MarketingButton
                        label="Contact support"
                        variant="secondary"
                        size="medium"
                        onClick={() => window.location.href = "/contact"}
                    />
                </div>
            </div>
        </div>
    );
}
