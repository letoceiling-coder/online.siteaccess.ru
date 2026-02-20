import { Link } from 'react-router-dom';

export default function Marketing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-indigo-600">SiteAccess</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/app/login"
                className="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium"
              >
                Login
              </Link>
              <Link
                to="/app/register"
                className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
              >
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-5xl font-extrabold text-gray-900 mb-6">
            Online Chat Widget
            <br />
            <span className="text-indigo-600">for Your Website</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Add a powerful chat widget to your website in minutes. Connect with your visitors in real-time.
          </p>
          <div className="space-x-4">
            <Link
              to="/app/register"
              className="bg-indigo-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-indigo-700 inline-block"
            >
              Get Started Free
            </Link>
            <a
              href="#features"
              className="bg-white text-indigo-600 px-8 py-3 rounded-lg text-lg font-semibold border-2 border-indigo-600 hover:bg-indigo-50 inline-block"
            >
              Learn More
            </a>
          </div>
        </div>

        <div id="features" className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-3">Easy Integration</h3>
            <p className="text-gray-600">
              Add our widget to your website with just one line of code. No complex setup required.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-3">Real-time Chat</h3>
            <p className="text-gray-600">
              Connect with your visitors instantly. Respond to messages in real-time from your operator panel.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-3">Secure & Private</h3>
            <p className="text-gray-600">
              Your data is encrypted and secure. We respect your privacy and never share your information.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
