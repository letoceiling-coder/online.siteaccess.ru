import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

const API_URL = 'https://online.siteaccess.ru';

interface InstallData {
  scriptTag: string;
  configSnippet: string;
  docsMarkdownShort: string;
  hasToken?: boolean;
}

export default function InstallPage() {
  const { id } = useParams<{ id: string }>();
  const [installData, setInstallData] = useState<InstallData | null>(null);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

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

  const handleRegenerateToken = async () => {
    if (!confirm('Are you sure you want to regenerate the token? The old token will stop working.')) {
      return;
    }

    setRegenerating(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/projects/${id}/token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNewToken(data.token);
        setCurrentToken(data.token);
        setShowTokenModal(true);
        // Update install data with new token
        if (installData) {
          const updatedConfig = `window.SiteAccessChat = { token: "${data.token}", apiBase: "https://online.siteaccess.ru" };`;
          setInstallData({
            ...installData,
            configSnippet: updatedConfig,
            hasToken: true,
          });
        }
      } else {
        alert('Failed to regenerate token');
      }
    } catch (err) {
      console.error('Failed to regenerate token', err);
      alert('Failed to regenerate token');
    } finally {
      setRegenerating(false);
    }
  };

  const getFullCode = () => {
    if (currentToken && installData) {
      const configWithToken = `window.SiteAccessChat = { token: "${currentToken}", apiBase: "https://online.siteaccess.ru" };`;
      return `${installData.scriptTag}\n${configWithToken}`;
    }
    return installData ? `${installData.scriptTag}\n${installData.configSnippet}` : '';
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

  const fullCode = getFullCode();

  return (
    <div className="min-h-screen bg-gray-50">
      {showTokenModal && newToken && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Token Generated</h2>
            <p className="text-gray-600 mb-4">
              Save this token now - it will not be shown again:
            </p>
            <div className="bg-gray-100 p-3 rounded mb-4 font-mono text-sm break-all">
              {newToken}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  copyToClipboard(newToken);
                }}
                className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
              >
                {copied ? 'Copied!' : 'Copy Token'}
              </button>
              <button
                onClick={() => {
                  setShowTokenModal(false);
                  setNewToken(null);
                }}
                className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Install Widget</h1>
          <button
            onClick={handleRegenerateToken}
            disabled={regenerating}
            className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {regenerating ? 'Regenerating...' : 'Regenerate Token'}
          </button>
        </div>

        {!currentToken && installData && !installData.hasToken && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Token Required</h3>
            <p className="text-yellow-700 text-sm">
              You need to regenerate your project token first. Click the "Regenerate Token" button above.
            </p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Method 1: Direct HTML Insert</h2>
          <p className="text-gray-600 mb-4">
            Add this code to your website's <code className="bg-gray-100 px-2 py-1 rounded">&lt;head&gt;</code> section:
          </p>
          <div className="relative">
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
              <code>{fullCode || 'Please regenerate token first'}</code>
            </pre>
            <button
              onClick={() => copyToClipboard(fullCode)}
              disabled={!currentToken}
              className="absolute top-2 right-2 bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
