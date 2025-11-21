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
    referrerProduct: '', // Referrer ka product change hoga
    // refereeProduct fixed rahega overall
  });

  // Fixed referee product - yeh sab rewards ke liye same rahega
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
          setProducts([{ label: 'Select Product for New Customers', value: '' }, ...productsResult.data]);
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
          setMessage('✅ Data loaded successfully!');
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

    // ✅ Check if referral count already exists (for new rewards only)
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
      // Update existing reward
      setReferralRewards(prev => 
        prev.map(reward => 
          reward.id === currentReward.id ? currentReward : reward
        )
      );
      setMessage('✅ Reward updated!');
    } else {
      // Add new reward with unique ID
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

  // ✅ AUTO SAVE - No manual save button needed
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
      <div style={{ padding: '50px', textAlign: 'center' }}>
        <h2>Loading Referral Settings...</h2>
        <button onClick={loadInitialData} style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px' }}>
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>🎯 Referral Program Settings</h1>
      
      {/* Message Display */}
      {message && (
        <div style={{ 
          padding: '15px', 
          background: message.includes('✅') ? '#d4edda' : '#f8d7da',
          border: `1px solid ${message.includes('✅') ? '#c3e6cb' : '#f5c6cb'}`,
          borderRadius: '8px',
          marginBottom: '25px',
          color: message.includes('✅') ? '#155724' : '#721c24'
        }}>
          {message}
          {saving && ' (Saving...)'}
        </div>
      )}

      {/* Fixed Referee Product Section */}
      <div style={{ 
        background: '#fff3cd', 
        padding: '25px', 
        borderRadius: '12px', 
        marginBottom: '30px',
        border: '2px solid #ffeaa7'
      }}>
        <h3 style={{ marginBottom: '20px', color: '#856404' }}>
         Fixed Gift for Referees
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <label style={{ fontWeight: 'bold', minWidth: '200px' }}>
           Product Reward for Every Referee
          </label>
          <select 
            value={fixedRefereeProduct}
            onChange={(e) => setFixedRefereeProduct(e.target.value)}
            style={{ 
              padding: '12px', 
              width: '300px', 
              border: '2px solid #e1e3e5',
              borderRadius: '6px',
              fontSize: '16px',
              background: 'white'
            }}
          >
            {/* <option value=""></option> */}
            {products.map(product => (
              <option key={product.value} value={product.value}>{product.label}</option>
            ))}
          </select>
        
        </div>
      </div>

      {/* Status Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        background: '#e7f3ff', 
        padding: '15px 20px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        border: '1px solid #b3d9ff'
      }}>
        <div>
          <strong>🔗 Connected to:</strong>
          <span style={{ marginLeft: '10px' }}>
            Database: ✅ Active • Shopify: ✅ {products.length} Products • Reward Levels: {referralRewards.length}
          </span>
        </div>
        
        <button 
          onClick={openAddModal} 
          style={{ 
            padding: '10px 20px', 
            background: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 'bold'
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
            border: '2px dashed #ddd',
            borderRadius: '12px',
            color: '#666',
            background: '#fafafa'
          }}>
            <h3 style={{ color: '#999', marginBottom: '15px' }}>No Reward Levels for Referrers</h3>
            <p style={{ marginBottom: '25px' }}>Start by adding reward levels for your referrers</p>
            <button 
              onClick={openAddModal}
              style={{ 
                padding: '12px 25px', 
                background: '#28a745', 
                color: 'white', 
                border: 'none', 
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              Create First Reward Level
            </button>
          </div>
        ) : (
          <div style={{ 
            background: 'white', 
            border: '1px solid #e1e3e5', 
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            {/* Table Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 2fr 1fr',
              gap: '15px',
              padding: '15px 20px',
              background: '#f8f9fa',
              borderBottom: '2px solid #e1e3e5',
              fontWeight: 'bold',
              color: '#333'
            }}>
              <div>Referrals</div>
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
                  gap: '15px',
                  padding: '15px 20px',
                  borderBottom: index === referralRewards.length - 1 ? 'none' : '1px solid #e1e3e5',
                  alignItems: 'center'
                }}
              >
                <div style={{ fontWeight: 'bold', color: '#007bff' }}>
                  After {reward.referralCount} Referral{reward.referralCount > 1 ? 's' : ''}
                </div>
                
                <div>
                  {products.find(p => p.value === reward.referrerProduct)?.label || 'Product not found'}
                </div>
                
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button 
                    onClick={() => openEditModal(reward)}
                    style={{ 
                      padding: '6px 12px', 
                      background: '#17a2b8', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    ✏️ Edit
                  </button>
                  <button 
                    onClick={() => deleteReward(reward.id)}
                    style={{ 
                      padding: '6px 12px', 
                      background: '#dc3545', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
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
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '30px',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <h2 style={{ marginBottom: '25px' }}>
              {currentReward.id ? 'Edit Reward Level' : 'Add Reward Level'}
            </h2>
            
            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>After How Many Referrals? *</label>
              <input 
                type="number"
                value={currentReward.referralCount}
                onChange={(e) => setCurrentReward({...currentReward, referralCount: e.target.value})}
                placeholder="e.g., 1, 3, 5"
                style={{ 
                  padding: '12px', 
                  width: '100%', 
                  border: '2px solid #e1e3e5',
                  borderRadius: '6px',
                  fontSize: '16px'
                }}
                min="1"
              />
              {/* Show warning if referral count already exists */}
              {!currentReward.id && currentReward.referralCount && referralRewards.find(reward => reward.referralCount === currentReward.referralCount) && (
                <div style={{ color: '#dc3545', fontSize: '14px', marginTop: '5px' }}>
                  ⚠️ Reward for {currentReward.referralCount} referrals already exists!
                </div>
              )}
            </div>

            <div style={{ marginBottom: '30px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Reward for Referrer *</label>
              <select 
                value={currentReward.referrerProduct}
                onChange={(e) => setCurrentReward({...currentReward, referrerProduct: e.target.value})}
                style={{ 
                  padding: '12px', 
                  width: '100%', 
                  border: '2px solid #e1e3e5',
                  borderRadius: '6px',
                  fontSize: '16px'
                }}
              >
                <option value="">Select Product for Referrer</option>
                {products.map(product => (
                  <option key={product.value} value={product.value}>{product.label}</option>
                ))}
              </select>
            </div>

            {/* <div style={{ 
              background: '#e7f3ff', 
              padding: '15px', 
              borderRadius: '6px',
              marginBottom: '20px',
              border: '1px solid #b3d9ff'
            }}>
              <strong>🎁 For New Customers:</strong>
              <div style={{ marginTop: '5px', color: '#0066cc' }}>
                {fixedRefereeProduct 
                  ? products.find(p => p.value === fixedRefereeProduct)?.label || 'Selected Product'
                  : 'No product selected yet'
                }
              </div>
              <small style={{ color: '#666' }}>
                This product will be given to every new customer who signs up via referral
              </small>
            </div> */}

            <div style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowModal(false)}
                style={{ 
                  padding: '12px 25px', 
                  background: '#6c757d', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={saveReward}
                disabled={!currentReward.id && currentReward.referralCount && referralRewards.find(reward => reward.referralCount === currentReward.referralCount)}
                style={{ 
                  padding: '12px 25px', 
                  background: (!currentReward.id && currentReward.referralCount && referralRewards.find(reward => reward.referralCount === currentReward.referralCount)) ? '#6c757d' : '#007bff', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '6px',
                  cursor: (!currentReward.id && currentReward.referralCount && referralRewards.find(reward => reward.referralCount === currentReward.referralCount)) ? 'not-allowed' : 'pointer'
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