export function Footer({showSitemapLink = true} : {showSitemapLink?: boolean }) {
    return (
        <footer className="w-full border-t border-gray-200 bg-white/90 backdrop-blur">
            <div className="grid grid-cols-1 md:grid-cols-2 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <div className="text-center md:text-left text-sm text-gray-600 flex flex-col md:flex-row md:gap-2">
                    <p>&copy; 2025-{new Date().getFullYear()} White Point Surveying & Mapping LLC.</p>
                    <p>All rights reserved.</p>
                </div>
                <div className="mt-4 md:mt-0 grid grid-cols-2 text-center md:flex md:justify-end md:gap-6">
                    <a href="https://www.whitepointsurvey.com/privacy-policy" className="text-sm text-gray-600 hover:text-gray-900 transition">Privacy Policy</a>
                    <a href="https://www.whitepointsurvey.com/eula" className="text-sm text-gray-600 hover:text-gray-900 transition">EULA</a>
                    <a href="https://www.whitepointsurvey.com/terms-of-service" className="text-sm text-gray-600 hover:text-gray-900 transition">Terms of Service</a>
                    <a href="https://www.whitepointsurvey.com/contact" className="text-sm text-gray-600 hover:text-gray-900 transition">Contact Us</a>
                    {showSitemapLink && (
                        <a href="https://www.whitepointsurvey.com/sitemap.xml" className="text-sm text-gray-600 hover:text-gray-900 transition">Sitemap</a>
                    )}
                </div>
            </div>
        </footer>
    );
}
