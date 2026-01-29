import { useState, useRef } from 'react';
import { Camera, Upload, X, Zap, Loader2 } from 'lucide-react';

/**
 * FixtureCamera - Photo capture component for Lenard AI analysis
 * Captures photos via camera or file upload, sends to AI for fixture identification
 */
export default function FixtureCamera({ onAnalysisComplete, auditContext, theme }) {
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const defaultTheme = {
    bg: '#f7f5ef',
    bgCard: '#ffffff',
    border: '#d6cdb8',
    text: '#2c3530',
    textMuted: '#7d8a7f',
    accent: '#5a6349',
    accentBg: 'rgba(90,99,73,0.12)'
  };
  const t = theme || defaultTheme;

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
  };

  const processImage = (file) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const clearPreview = () => {
    setPreview(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const analyzeWithLenard = async () => {
    if (!preview) return;

    setAnalyzing(true);
    setError(null);

    try {
      // Extract base64 data (remove data:image/...;base64, prefix)
      const base64Data = preview.split(',')[1];

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-fixture`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            imageBase64: base64Data,
            auditContext
          })
        }
      );

      const data = await response.json();

      if (data.success) {
        onAnalysisComplete?.({
          analysis: data.analysis,
          imagePreview: preview
        });
        clearPreview();
      } else {
        setError(data.error || 'Analysis failed');
      }
    } catch (err) {
      setError(err.message || 'Failed to analyze image');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div style={{
      background: t.bgCard,
      border: `1px solid ${t.border}`,
      borderRadius: '12px',
      padding: '16px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '12px'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          background: '#f59e0b20',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Zap style={{ width: '18px', height: '18px', color: '#f59e0b' }} />
        </div>
        <div>
          <div style={{ fontWeight: '600', color: t.text, fontSize: '14px' }}>
            Lenard AI Analysis
          </div>
          <div style={{ fontSize: '12px', color: t.textMuted }}>
            Snap a photo to identify fixtures
          </div>
        </div>
      </div>

      {/* Preview or Upload Buttons */}
      {preview ? (
        <div style={{ position: 'relative' }}>
          <img
            src={preview}
            alt="Preview"
            style={{
              width: '100%',
              maxHeight: '200px',
              objectFit: 'cover',
              borderRadius: '8px',
              border: `1px solid ${t.border}`
            }}
          />
          <button
            onClick={clearPreview}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}
          >
            <X size={16} />
          </button>

          {/* Analyze Button */}
          <button
            onClick={analyzeWithLenard}
            disabled={analyzing}
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '12px',
              background: analyzing ? t.border : '#f59e0b',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: analyzing ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {analyzing ? (
              <>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                Lenard is analyzing...
              </>
            ) : (
              <>
                <Zap size={18} />
                Analyze with Lenard
              </>
            )}
          </button>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          gap: '12px'
        }}>
          {/* Camera Button */}
          <button
            onClick={() => cameraInputRef.current?.click()}
            style={{
              flex: 1,
              padding: '20px 16px',
              background: t.accentBg,
              border: `2px dashed ${t.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              color: t.accent
            }}
          >
            <Camera size={24} />
            <span style={{ fontSize: '13px', fontWeight: '500' }}>Camera</span>
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {/* Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              flex: 1,
              padding: '20px 16px',
              background: t.accentBg,
              border: `2px dashed ${t.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              color: t.accent
            }}
          >
            <Upload size={24} />
            <span style={{ fontSize: '13px', fontWeight: '500' }}>Upload</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          marginTop: '12px',
          padding: '10px',
          background: 'rgba(239,68,68,0.1)',
          borderRadius: '6px',
          color: '#dc2626',
          fontSize: '13px'
        }}>
          {error}
        </div>
      )}

      {/* Spinner Animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
