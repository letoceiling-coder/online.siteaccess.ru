import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

const API_URL = 'https://online.siteaccess.ru';

interface InstallData {
  scriptTag: string;
  configSnippet: string;
  docsMarkdownShort: string;
}

export default function InstallPage() {
  const { id } = useParams<{ id: string }>();
  const [installData, setInstallData] = useState<InstallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadInstallData();
  }, [id]);

  const loadInstallData = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/projects/${id}/install`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setInstallData(data);
      }
    } catch (err) {
      console.error('Failed to load install data', err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!installData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg text-red-600">Failed to load install data</div>
      </div>
    );
  }

  const fullCode = `${installData.scriptTag}\n${installData.configSnippet}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/app" className="text-xl font-bold text-indigo-600">
                SiteAccess Dashboard
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/operator/"
                target="_blank"
                className="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium"
              >
                Open Operator Panel
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Install Widget</h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Method 1: Direct HTML Insert</h2>
          <p className="text-gray-600 mb-4">
            Add this code to your website's <code className="bg-gray-100 px-2 py-1 rounded">&lt;head&gt;</code> section:
          </p>
          <div className="relative">
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
              <code>{fullCode}</code>
            </pre>
            <button
              onClick={() => copyToClipboard(fullCode)}
              className="absolute top-2 right-2 bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Method 2: Google Tag Manager</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Go to your GTM container</li>
            <li>Create a new Custom HTML tag</li>
            <li>Paste the code above</li>
            <li>Set trigger to "All Pages"</li>
            <li>Save and publish</li>
          </ol>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-2">Quick Start</h3>
          <p className="text-blue-700 text-sm">
            After adding the code, the chat widget will appear in the bottom-right corner of your website.
            Visitors can start conversations, and you can respond from the operator panel.
          </p>
        </div>
      </main>
    </div>
  );
}
