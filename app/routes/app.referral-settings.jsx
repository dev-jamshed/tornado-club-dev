import React, { useState, useEffect } from 'react';

export default function ReferralSettings() {
  const [referralRewards, setReferralRewards] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [currentReward, setCurrentReward] = useState({ 
    id: null,
    referralCount: '', 
    referrerProduct: '',
  });

  const [fixedRefereeProduct, setFixedRefereeProduct] = useState('');

  // Load data on component mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      
      // Load Shopify products
      try {
        const productsResponse = await fetch('/api/shopify/products');
        if (!productsResponse.ok) throw new Error('Products API failed');
        
        const productsResult = await productsResponse.json();
        
        if (productsResult.success) {
          setProducts([{ label: 'Select Product', value: '' }, ...productsResult.data]);
        } else {
          throw new Error(productsResult.error);
        }
      } catch (error) {
        setMessage('❌ Failed to load products');
        return;
      }

      // Load database settings
      try {
        const settingsResponse = await fetch('/api/referral-setting');
        const settingsResult = await settingsResponse.json();
        if (settingsResult.success) {
          const data = settingsResult.data.referralRewards || [];
          setReferralRewards(data.rewards || []);
          setFixedRefereeProduct(data.fixedRefereeProduct || '');
          setMessage('✅ Settings loaded successfully!');
        }
      } catch (error) {
        setReferralRewards([]);
        setFixedRefereeProduct('');
        setMessage('ℹ️ Starting fresh session');
      }
      
    } catch (error) {
      setMessage('❌ Error loading data');
    } finally {
      setLoading(false);
    }
  };

  // Add new reward modal
  const openAddModal = () => {
    setCurrentReward({ 
      id: null,
      referralCount: '', 
      referrerProduct: '', 
    });
    setShowModal(true);
  };

  // Edit existing reward
  const openEditModal = (reward) => {
    setCurrentReward({ 
      id: reward.id || Date.now(),
      referralCount: reward.referralCount, 
      referrerProduct: reward.referrerProduct, 
    });
    setShowModal(true);
  };

  // Save reward to local state
  const saveReward = () => {
    if (!currentReward.referralCount || !currentReward.referrerProduct) {
      alert('Please fill all fields');
      return;
    }

    if (!currentReward.id) {
      const existingReward = referralRewards.find(
        reward => reward.referralCount === currentReward.referralCount
      );
      
      if (existingReward) {
        alert(`❌ Reward for ${currentReward.referralCount} referrals already exists! Please use a different number.`);
        return;
      }
    }

    if (currentReward.id) {
      setReferralRewards(prev => 
        prev.map(reward => 
          reward.id === currentReward.id ? currentReward : reward
        )
      );
      setMessage('✅ Reward updated!');
    } else {
      const newReward = { ...currentReward, id: Date.now() };
      setReferralRewards(prev => [...prev, newReward]);
      setMessage('✅ New reward added!');
    }

    setShowModal(false);
  };

  // Delete reward with confirmation
  const deleteReward = (id) => {
    const rewardToDelete = referralRewards.find(reward => reward.id === id);
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the reward for ${rewardToDelete?.referralCount} referrals?`
    );
    
    if (confirmDelete) {
      setReferralRewards(prev => prev.filter(reward => reward.id !== id));
      setMessage('✅ Reward deleted!');
    }
  };

  // Auto-save to database
  const autoSaveToDatabase = async (updatedRewards, fixedProduct) => {
    setSaving(true);
    
    try {
      const response = await fetch('/api/referral-setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          referralRewards: {
            rewards: updatedRewards,
            fixedRefereeProduct: fixedProduct
          },
          method: "update"
        })
      });

      const result = await response.json();

      if (result.success) {
        setMessage('✅ Changes saved automatically!');
      } else {
        setMessage('❌ Auto-save failed: ' + result.error);
      }
    } catch (error) {
      setMessage('❌ Auto-save error: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Auto-save when rewards or fixed product change
  useEffect(() => {
    if (referralRewards.length > 0 || fixedRefereeProduct) {
      const timer = setTimeout(() => {
        autoSaveToDatabase(referralRewards, fixedRefereeProduct);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [referralRewards, fixedRefereeProduct]);

  if (loading) {
    return (
      <div style={{ 
        padding: '50px', 
        textAlign: 'center',
        background: '#f8fafc',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <h2 style={{ color: '#2d3748', marginBottom: '20px' }}>Loading Referral Settings...</h2>
        <button 
          onClick={loadInitialData} 
          style={{ 
            padding: '12px 24px', 
            background: '#3182ce', 
            color: 'white', 
            border: 'none', 
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div style={{
      padding: "20px",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      background: "#f8fafc",
      minHeight: "100vh",
      maxWidth: "1200px",
      margin: "0 auto"
    }}>

      {/* Header */}
      <div style={{
        background: "white",
        borderRadius: "12px",
        padding: "24px",
        marginBottom: "24px",
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
        border: "1px solid #e2e8f0"
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px"
        }}>
          <div>
            <h1 style={{
              color: "#1a202c",
              margin: "0 0 4px 0",
              fontSize: "28px",
              fontWeight: "700"
            }}>
              ⚙️ Referral Program Settings
            </h1>
            <p style={{
              color: "#718096",
              margin: 0,
              fontSize: "14px"
            }}>
              Product Reward for Every Referee

            </p>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={loadInitialData}
              disabled={loading}
              style={{
                padding: '10px 20px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Message Display */}
      {message && (
        <div style={{
          padding: '16px',
          background: message.includes('✅') ? '#f0fff4' : '#fff5f5',
          border: `1px solid ${message.includes('✅') ? '#9ae6b4' : '#fed7d7'}`,
          borderRadius: '12px',
          marginBottom: '24px',
          color: message.includes('✅') ? '#276749' : '#c53030',
          fontWeight: '500'
        }}>
          {message}
          {saving && ' (Saving...)'}
        </div>
      )}

      {/* Fixed Referee Product Section */}
      <div style={{ 
        background: "white",
        padding: '24px', 
        borderRadius: '12px', 
        marginBottom: '24px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ 
          marginBottom: '20px', 
          color: '#2d3748',
          fontSize: '18px',
          fontWeight: '600'
        }}>
          🎁 Gift for Referees
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <label style={{ 
            fontWeight: '600', 
            minWidth: '220px', 
            color: '#4a5568',
            fontSize: '14px'
          }}>
            Product for Every New Customer
          </label>
          <select 
            value={fixedRefereeProduct}
            onChange={(e) => setFixedRefereeProduct(e.target.value)}
            style={{ 
              padding: '12px 16px', 
              width: '400px', 
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '14px',
              background: 'white',
              transition: 'all 0.2s',
              color: '#4a5568'
            }}
          >
            <option value="">Select a product...</option>
            {products.map(product => (
              <option key={product.value} value={product.value}>{product.label}</option>
            ))}
          </select>
        </div>
        <p style={{ 
          marginTop: '12px', 
          color: '#718096', 
          fontSize: '13px',
          fontStyle: 'italic'
        }}>
            Every new customer who uses a referral link will receive this product

        </p>
      </div>

      {/* Status Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        background: 'white', 
        padding: '20px', 
        borderRadius: '12px', 
        marginBottom: '24px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ color: '#4a5568', fontSize: '14px' }}>
          <strong style={{ color: '#2d3748' }}>🔗 Connection Status:</strong>
          <span style={{ marginLeft: '12px' }}>
            Database: <span style={{ color: '#38a169', fontWeight: '600' }}>✅ Active</span> • 
            Shopify: <span style={{ color: '#38a169', fontWeight: '600' }}>✅ {products.length} Products</span> • 
            Reward Levels: <span style={{ color: '#3182ce', fontWeight: '600' }}>{referralRewards.length}</span>
          </span>
        </div>
        
        <button 
          onClick={openAddModal} 
          style={{ 
            padding: '10px 20px', 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white', 
            border: 'none', 
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)'
          }}
        >
          ➕ Add Reward Level
        </button>
      </div>

      {/* Rewards Table */}
      <div style={{ marginBottom: '40px' }}>
        {referralRewards.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 40px', 
            border: '2px dashed #e2e8f0',
            borderRadius: '12px',
            color: '#718096',
            background: 'white',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ color: '#a0aec0', marginBottom: '16px', fontSize: '18px' }}>No Reward Levels Configured</h3>
            <p style={{ marginBottom: '24px', fontSize: '14px' }}>Start by adding reward levels for your referrers</p>
            <button 
              onClick={openAddModal}
              style={{ 
                padding: '12px 24px', 
                background: 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)',
                color: 'white', 
                border: 'none', 
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}
            >
              Create First Reward Level
            </button>
          </div>
        ) : (
          <div style={{ 
            background: 'white', 
            border: '1px solid #e2e8f0', 
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)'
          }}>
            {/* Table Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 2fr 1fr',
              gap: '20px',
              padding: '16px 24px',
              background: '#f7fafc',
              borderBottom: '1px solid #e2e8f0',
              fontWeight: '600',
              color: '#4a5568',
              fontSize: '14px'
            }}>
              <div>Referrals Required</div>
              <div>Reward for Referrer</div>
              <div style={{ textAlign: 'center' }}>Actions</div>
            </div>

            {/* Table Rows */}
            {referralRewards.map((reward, index) => (
              <div 
                key={reward.id} 
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 2fr 1fr',
                  gap: '20px',
                  padding: '16px 24px',
                  borderBottom: index === referralRewards.length - 1 ? 'none' : '1px solid #f7fafc',
                  alignItems: 'center',
                  background: index % 2 === 0 ? '#fafafa' : 'white',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{ fontWeight: '600', color: '#3182ce', fontSize: '15px' }}>
                  After {reward.referralCount} Referral{reward.referralCount > 1 ? 's' : ''}
                </div>
                
                <div style={{ color: '#4a5568', fontSize: '14px' }}>
                  {products.find(p => p.value === reward.referrerProduct)?.label || 'Product not found'}
                </div>
                
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button 
                    onClick={() => openEditModal(reward)}
                    style={{ 
                      padding: '8px 16px', 
                      background: '#3182ce', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500',
                      transition: 'all 0.2s'
                    }}
                  >
                    ✏️ Edit
                  </button>
                  <button 
                    onClick={() => deleteReward(reward.id)}
                    style={{ 
                      padding: '8px 16px', 
                      background: '#e53e3e', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500',
                      transition: 'all 0.2s'
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h2 style={{
                margin: 0,
                color: '#2d3748',
                fontSize: '20px',
                fontWeight: '600'
              }}>
                {currentReward.id ? 'Edit Reward Level' : 'Add Reward Level'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#718096',
                  padding: '4px',
                  borderRadius: '4px',
                  transition: 'all 0.2s'
                }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: "block", 
                marginBottom: "8px", 
                color: "#4a5568", 
                fontWeight: "500",
                fontSize: "14px"
              }}>
                After How Many Referrals? *
              </label>
              <input 
                type="number"
                value={currentReward.referralCount}
                onChange={(e) => setCurrentReward({...currentReward, referralCount: e.target.value})}
                placeholder="e.g., 1, 3, 5"
                style={{ 
                  padding: '12px 16px', 
                  width: '100%', 
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                  color: '#4a5568'
                }}
                min="1"
              />
              {!currentReward.id && currentReward.referralCount && referralRewards.find(reward => reward.referralCount === currentReward.referralCount) && (
                <div style={{ color: '#e53e3e', fontSize: '13px', marginTop: '8px', fontWeight: '500' }}>
                  ⚠️ Reward for {currentReward.referralCount} referrals already exists!
                </div>
              )}
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ 
                display: "block", 
                marginBottom: "8px", 
                color: "#4a5568", 
                fontWeight: "500",
                fontSize: "14px"
              }}>
                Reward for Referrer *
              </label>
              <select 
                value={currentReward.referrerProduct}
                onChange={(e) => setCurrentReward({...currentReward, referrerProduct: e.target.value})}
                style={{ 
                  padding: '12px 16px', 
                  width: '100%', 
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                  color: '#4a5568'
                }}
              >
                <option value="">Select Product for Referrer</option>
                {products.map(product => (
                  <option key={product.value} value={product.value}>{product.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowModal(false)}
                style={{ 
                  padding: '12px 24px', 
                  background: '#a0aec0', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={saveReward}
                disabled={!currentReward.id && currentReward.referralCount && referralRewards.find(reward => reward.referralCount === currentReward.referralCount)}
                style={{ 
                  padding: '12px 24px', 
                  background: (!currentReward.id && currentReward.referralCount && referralRewards.find(reward => reward.referralCount === currentReward.referralCount)) 
                    ? '#a0aec0' 
                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '8px',
                  cursor: (!currentReward.id && currentReward.referralCount && referralRewards.find(reward => reward.referralCount === currentReward.referralCount)) 
                    ? 'not-allowed' 
                    : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'all 0.2s'
                }}
              >
                {currentReward.id ? 'Update Reward' : 'Save Reward'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}