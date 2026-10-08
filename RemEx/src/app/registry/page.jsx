'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';

export default function RegistryPage() {
  const [backendUrl, setBackendUrl] = useState('');
  const [hives, setHives] = useState([]);
  const [selectedHive, setSelectedHive] = useState('HKEY_LOCAL_MACHINE');
  const [keyPath, setKeyPath] = useState('');
  const [keys, setKeys] = useState([]);
  const [values, setValues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const savedUrl = localStorage.getItem('remexBackendUrl');
    if (savedUrl) {
      setBackendUrl(savedUrl);
      fetchHives(savedUrl);
    }
  }, []);

  const fetchHives = async (url) => {
    try {
      const response = await fetch(`${url}/api/registry/hives`);
      const data = await response.json();
      setHives(data);
    } catch (e) {
      setError('Failed to fetch hives');
    }
  };

  const handleUrlChange = (e) => {
    const url = e.target.value;
    setBackendUrl(url);
    localStorage.setItem('remexBackendUrl', url);
    if (url) fetchHives(url);
  };

  const fetchKeys = async () => {
    if (!backendUrl) {
      setError('Backend URL not set');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        hive: selectedHive,
        path: keyPath
      });
      const response = await fetch(`${backendUrl}/api/registry/keys?${params}`);
      if (!response.ok) throw new Error('Failed to fetch keys');
      const data = await response.json();
      setKeys(data);
      await fetchValues();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchValues = async () => {
    if (!backendUrl) return;
    try {
      const keyPathFull = keyPath ? `${selectedHive}\\${keyPath}` : selectedHive;
      const params = new URLSearchParams({ keyPath: keyPathFull });
      const response = await fetch(`${backendUrl}/api/registry/values?${params}`);
      if (!response.ok) throw new Error('Failed to fetch values');
      const data = await response.json();
      setValues(data);
    } catch (e) {
      // Silently fail if key has no values
    }
  };

  const handleSelectKey = (key) => {
    const newPath = keyPath ? `${keyPath}\\${key.name}` : key.name;
    setKeyPath(newPath);
  };

  const handleCreateKey = async () => {
    const newKeyName = prompt('Enter new key name:');
    if (!newKeyName) return;

    const fullPath = keyPath ? `${selectedHive}\\${keyPath}\\${newKeyName}` : `${selectedHive}\\${newKeyName}`;
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/registry/keys?keyPath=${encodeURIComponent(fullPath)}`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to create key');
      await fetchKeys();
      alert('Key created successfully');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!keyPath && !selectedHive) return;
    if (!confirm('Are you sure you want to delete this key?')) return;

    const fullPath = keyPath ? `${selectedHive}\\${keyPath}` : selectedHive;
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/registry/keys?keyPath=${encodeURIComponent(fullPath)}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete key');
      setKeyPath('');
      setKeys([]);
      setValues([]);
      alert('Key deleted successfully');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        hive: selectedHive,
        searchTerm: searchTerm
      });
      const response = await fetch(`${backendUrl}/api/registry/search?${params}`);
      if (!response.ok) throw new Error('Failed to search');
      const data = await response.json();
      setSearchResults(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!keyPath && !selectedHive) return;
    const fullPath = keyPath ? `${selectedHive}\\${keyPath}` : selectedHive;
    try {
      const response = await fetch(`${backendUrl}/api/registry/export?keyPath=${encodeURIComponent(fullPath)}`);
      if (!response.ok) throw new Error('Failed to export');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'registry_export.reg';
      a.click();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className={styles.container}>
      <h1>Registry Manager</h1>

      <div className={styles.section}>
        <input
          type="text"
          placeholder="Backend URL (e.g., http://localhost:9014)"
          value={backendUrl}
          onChange={handleUrlChange}
          className={styles.input}
        />
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <div className={styles.hiveSelector}>
          <label>Hive:</label>
          <select value={selectedHive} onChange={(e) => setSelectedHive(e.target.value)}>
            {hives.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <button onClick={fetchKeys} disabled={loading}>Browse</button>
          <button onClick={() => setShowSearch(!showSearch)}>Search</button>
          {keyPath && <button onClick={handleExport}>Export</button>}
          {keyPath && <button onClick={handleCreateKey} disabled={loading}>+ Key</button>}
          {keyPath && <button onClick={handleDeleteKey} disabled={loading} className={styles.danger}>Delete Key</button>}
        </div>
      </div>

      {showSearch && (
        <div className={styles.section}>
          <div className={styles.searchBox}>
            <input
              type="text"
              placeholder="Search term"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button onClick={handleSearch} disabled={loading}>Search</button>
          </div>
          {searchResults.length > 0 && (
            <div className={styles.searchResults}>
              {searchResults.map((r, i) => (
                <div key={i} className={styles.resultItem}>
                  <strong>{r.keyPath}</strong>
                  <p>{r.entry}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {keyPath && (
        <div className={styles.pathDisplay}>
          Current Path: <code>{selectedHive}\\{keyPath}</code>
          <button onClick={() => setKeyPath('')}>Clear Path</button>
        </div>
      )}

      <div className={styles.content}>
        <div className={styles.keysPanel}>
          <h3>Keys</h3>
          <div className={styles.list}>
            {keys.map((key, i) => (
              <div
                key={i}
                className={styles.listItem}
                onClick={() => handleSelectKey(key)}
              >
                📁 {key.name}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.valuesPanel}>
          <h3>Values</h3>
          <div className={styles.list}>
            {values.map((val, i) => (
              <div key={i} className={styles.valueItem}>
                <div className={styles.valueName}>{val.name || '(Default)'}</div>
                <div className={styles.valueType}>{val.type}</div>
                <div className={styles.valueData}>{val.data}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
