import { useState, useEffect, useRef } from 'react';

export default function Referrals() {
  const [shopName, setShopName] = useState('');
  const [shopDomain, setShopDomain] = useState('');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [select2Ready, setSelect2Ready] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalSelectedCustomer, setModalSelectedCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const modalSelectRef = useRef(null);

  // Load jQuery and Select2 from CDN
  useEffect(() => {
    const loadSelect2 = () => {
      if (window.jQuery && window.jQuery.fn.select2) {
        setSelect2Ready(true);
        return;
      }

      const jqueryScript = document.createElement('script');
      jqueryScript.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
      jqueryScript.integrity = 'sha256-/xUj+3OJU5yExlq6GSYGSHk7tPXikynS7ogEvDej/m4=';
      jqueryScript.crossOrigin = 'anonymous';

      jqueryScript.onload = () => {
        const select2Script = document.createElement('script');
        select2Script.src = 'https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.13/js/select2.min.js';
        select2Script.onload = () => {
          const select2CSS = document.createElement('link');
          select2CSS.rel = 'stylesheet';
          select2CSS.href = 'https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.13/css/select2.min.css';
          document.head.appendChild(select2CSS);
          setSelect2Ready(true);
        };
        document.head.appendChild(select2Script);
      };
      document.head.appendChild(jqueryScript);
    };

    loadSelect2();
  }, []);

  // Load shop data - Dynamic domain get karo
  const loadShopData = async () => {
    try {
      let shopDomain = '';
      let shopName = 'My Shopify Store';

      // Method 1: Shopify environment variable se
      if (import.meta.env.VITE_SHOPIFY_DOMAIN) {
        shopDomain = import.meta.env.VITE_SHOPIFY_DOMAIN;
      }
      // Method 2: Shopify global object se
      else if (window.Shopify && window.Shopify.shop) {
        shopDomain = window.Shopify.shop;
      }
      // Method 3: Meta tags se (Shopify specific)
      else {
        const shopMeta = document.querySelector('meta[name="shopify_domain"]');
        if (shopMeta) {
          shopDomain = shopMeta.getAttribute('content');
        } else {
          // Method 4: Current URL se
          const currentUrl = window.location.href;
          const urlObj = new URL(currentUrl);
          shopDomain = urlObj.hostname;
          
          // Agar localhost hai toh default domain use karo
          if (shopDomain === 'localhost' || shopDomain.includes('.localhost')) {
            shopDomain = 'your-store.myshopify.com';
          }
        }
      }

      // Method 5: API call se shop data get karo
      try {
        const response = await fetch('/api/shop-info');
        if (response.ok) {
          const shopData = await response.json();
          if (shopData.domain) {
            shopDomain = shopData.domain;
          }
          if (shopData.name) {
            shopName = shopData.name;
          }
        }
      } catch (error) {
        console.log('API se shop data nahi mila, using fallback');
      }

      setShopName(shopName);
      setShopDomain(shopDomain);
      
      console.log('Shop Domain Set:', shopDomain);
      console.log('Shop Name Set:', shopName);

    } catch (error) {
      console.error('Error loading shop data:', error);
      // Final fallback
      const currentDomain = window.location.hostname;
      setShopName("My Shopify Store");
      setShopDomain(currentDomain || "your-store.myshopify.com");
    }
  };

  // Load initial data automatically
  useEffect(() => {
    if (select2Ready) {
      loadShopData();
      loadCustomers();
    }
  }, [select2Ready]);

  // Initialize Select2 when customers are loaded and modal is open
  useEffect(() => {
    if (select2Ready && customers.length > 0 && showCreateModal) {
      const $ = window.jQuery;

      // Modal Select2 - only initialize if modal is open and not already initialized
      if (modalSelectRef.current && !$(modalSelectRef.current).hasClass('select2-hidden-accessible')) {
        $(modalSelectRef.current).select2({
          placeholder: "Select a customer...",
          allowClear: true,
          width: '100%',
          templateResult: formatCustomer,
          templateSelection: formatCustomerSelection,
          dropdownParent: $('#createModal')
        });

        $(modalSelectRef.current).on('change', function (e) {
          const selectedId = e.target.value;
          const customer = customers.find(c => c.id === selectedId);
          setModalSelectedCustomer(customer || null);
        });
      }

      // Safe cleanup function
      return () => {
        const $ = window.jQuery;
        if (!$ || !$.fn.select2) return;

        if (modalSelectRef.current && $(modalSelectRef.current).hasClass('select2-hidden-accessible')) {
          try {
            $(modalSelectRef.current).off('change');
            $(modalSelectRef.current).select2('destroy');
          } catch (error) {
            console.log('Cleanup warning for modal select');
          }
        }
      };
    }
  }, [select2Ready, customers, showCreateModal]);

  // Format customer display in dropdown
  const formatCustomer = (customer) => {
    if (!customer.id) return customer.text;

    const customerData = customers.find(c => c.id === customer.id);
    if (!customerData) return customer.text;

    const hasReferral = customerData.referralCode;

    const $ = window.jQuery;
    const $container = $(
      `<div style="padding: 8px;">
        <div style="font-weight: bold; font-size: 14px;">
          ${customerData.name}
          ${hasReferral ? '<span style="margin-left: 8px; background: #28a745; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">Has Code</span>' : ''}
        </div>
        <div style="color: #666; font-size: 12px;">${customerData.email}</div>
      </div>`
    );

    return $container;
  };

  // Format selected customer display
  const formatCustomerSelection = (customer) => {
    if (!customer.id) return customer.text;

    const customerData = customers.find(c => c.id === customer.id);
    if (!customerData) return customer.text;

    const $ = window.jQuery;
    return $(
      `<div>
        <strong>${customerData.name}</strong>
        <span style="color: #666; margin-left: 8px;">${customerData.email}</span>
      </div>`
    );
  };

  // Load customers from Shopify automatically with metafields
  const loadCustomers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/customers');
      const result = await response.json();

      console.log('Customers loaded with metafields:', result);

      if (result.success) {
        setCustomers(result.customers);
        setMessage(`${result.customers.length} customers loaded successfully!`);
      } else {
        setMessage('Error loading customers: ' + result.error);
      }
    } catch (error) {
      setMessage('Error loading customers');
    } finally {
      setLoading(false);
    }
  };

  // Generate and save referral code - Metafield mein save karo
  const generateReferralCode = async (customer) => {
    if (!customer) {
      setMessage('Please select a customer first');
      return;
    }

    setLoading(true);
    try {
      const referralCode = `REF${customer.name ? customer.name.substring(0, 3).toUpperCase() : 'CUS'}${Date.now().toString(36).toUpperCase()}`;
      
      // Real domain use karo referral link mein
      const referralLink = `https://${shopDomain}/?ref=${referralCode}`;

      console.log('Generating referral with domain:', shopDomain);
      console.log('Referral Link:', referralLink);

      // Metafield mein save karo
      const response = await fetch('/api/save-referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          referralCode: referralCode,
          referralLink: referralLink
        })
      });

      const result = await response.json();

      if (result.success) {
        setMessage(`Referral code generated: ${referralCode}`);
        
        // Update local state
        setCustomers(prev => prev.map(c =>
          c.id === customer.id ? { 
            ...c, 
            referralCode: referralCode,
            referralsCount: 0 
          } : c
        ));

        // Refresh Select2 to show updated status
        if (modalSelectRef.current && window.jQuery) {
          window.jQuery(modalSelectRef.current).trigger('change.select2');
        }

        // Close modal after successful creation
        setShowCreateModal(false);
        setModalSelectedCustomer(null);
      } else {
        setMessage('Error: ' + result.error);
      }
    } catch (error) {
      setMessage('Error generating referral code');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, isUrl = false) => {
    navigator.clipboard.writeText(text);
    if (isUrl) {
      setMessage('Referral URL copied to clipboard!');
    } else {
      setMessage('Referral code copied to clipboard!');
    }
    setTimeout(() => setMessage(''), 2000);
  };

  // Calculate stats for dashboard - Metafields se
  const customersWithReferralCodes = customers.filter(c => c.referralCode).length;
  const totalReferrals = customers.reduce((sum, customer) => sum + (customer.referralsCount || 0), 0);

  // Filter customers with referral codes and sort by referrals count (descending)
  const customersWithReferrals = customers
    .filter(customer => customer.referralCode) // Sirf woh customers jo referral code rakhte hain
    .sort((a, b) => (b.referralsCount || 0) - (a.referralsCount || 0)); // Zyada referrals wale pehle

  // Filter based on search term
  const filteredCustomersWithReferrals = customersWithReferrals.filter(customer => 
    customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.referralCode?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Open create modal
  const openCreateModal = () => {
    setShowCreateModal(true);
    setModalSelectedCustomer(null);
  };

  // Close create modal
  const closeCreateModal = () => {
    setShowCreateModal(false);
    setModalSelectedCustomer(null);
  };

  return (
    <div style={{
      padding: "20px",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      background: "#f8fafc",
      minHeight: "100vh"
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
          marginBottom: "16px"
        }}>
          <div>
            <h1 style={{
              color: "#1a202c",
              margin: "0 0 4px 0",
              fontSize: "28px",
              fontWeight: "700"
            }}>
              Referral Program
            </h1>
            <p style={{
              color: "#718096",
              margin: 0,
              fontSize: "14px"
            }}>
              Store: <strong style={{ color: "#4a5568" }}>{shopName}</strong> • Domain: <strong style={{ color: "#4a5568" }}>{shopDomain}</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={loadCustomers}
              disabled={loading || !select2Ready}
              style={{
                padding: '10px 20px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: loading || !select2Ready ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Refresh
            </button>

            {/* <button
              onClick={openCreateModal}
              style={{
                padding: '10px 24px',
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
              Create New
            </button> */}
          </div>
        </div>
      </div>

      {/* Loading indicator for Select2 */}
      {!select2Ready && (
        <div style={{
          padding: '20px',
          background: '#fffaf0',
          border: '1px solid #feebc8',
          borderRadius: '12px',
          marginBottom: '24px',
          color: '#744210',
          textAlign: 'center'
        }}>
          <div style={{ fontWeight: '600' }}>Loading Components...</div>
          <div style={{ fontSize: '14px', color: '#a0aec0' }}>Please wait while we load the referral system</div>
        </div>
      )}

      {/* Message Display */}
      {message && (
        <div style={{
          padding: '16px',
          background: message.includes('✅') || message.includes('successfully') ? '#f0fff4' : '#fff5f5',
          border: `1px solid ${message.includes('✅') || message.includes('successfully') ? '#9ae6b4' : '#fed7d7'}`,
          borderRadius: '12px',
          marginBottom: '24px',
          color: message.includes('✅') || message.includes('successfully') ? '#276749' : '#c53030',
          fontWeight: '500'
        }}>
          {message}
          {loading && ' (Loading...)'}
        </div>
      )}

      {/* Dashboard */}
      <div>
        {/* Stats Cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
          marginBottom: "32px"
        }}>
          <div style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            padding: "24px",
            borderRadius: "12px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)"
          }}>
            <div style={{ fontSize: "14px", opacity: 0.9, marginBottom: "8px" }}>Total Customers</div>
            <div style={{ fontSize: "32px", fontWeight: "700" }}>{customers.length}</div>
          </div>

          <div style={{
            background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
            color: "white",
            padding: "24px",
            borderRadius: "12px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)"
          }}>
            <div style={{ fontSize: "14px", opacity: 0.9, marginBottom: "8px" }}>Customers with Codes</div>
            <div style={{ fontSize: "32px", fontWeight: "700" }}>{customersWithReferralCodes}</div>
          </div>

          <div style={{
            background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
            color: "white",
            padding: "24px",
            borderRadius: "12px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)"
          }}>
            <div style={{ fontSize: "14px", opacity: 0.9, marginBottom: "8px" }}>Total Referrals</div>
            <div style={{ fontSize: "32px", fontWeight: "700" }}>{totalReferrals}</div>
          </div>

          <div style={{
            background: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
            color: "white",
            padding: "24px",
            borderRadius: "12px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)"
          }}>
            <div style={{ fontSize: "14px", opacity: 0.9, marginBottom: "8px" }}>Active Codes</div>
            <div style={{ fontSize: "32px", fontWeight: "700" }}>{customersWithReferralCodes}</div>
          </div>
        </div>

        {/* Customers with Referral Codes */}
        {customersWithReferrals.length > 0 && (
          <div style={{
            background: "white",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
            border: "1px solid #e2e8f0"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px"
            }}>
              <h2 style={{
                color: "#2d3748",
                margin: 0,
                fontSize: "20px",
                fontWeight: "600"
              }}>
                Referral Codes ({customersWithReferrals.length})
              </h2>

              {/* Search Bar */}
              <div style={{ position: 'relative', width: '300px' }}>
                <input
                  type="text"
                  placeholder="Search by name, email or code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: '#f8fafc',
                    transition: 'all 0.2s'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#a0aec0'
                }}>
                  🔍
                </span>
              </div>
            </div>

            <div style={{
              background: "white",
              borderRadius: "8px",
              overflow: "hidden",
              border: "1px solid #e2e8f0",
              maxHeight: "600px",
              overflowY: "auto"
            }}>
              {/* Table Header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1.5fr",
                gap: "16px",
                padding: "16px 20px",
                background: "#f7fafc",
                borderBottom: "1px solid #e2e8f0",
                fontWeight: "600",
                color: "#4a5568",
                fontSize: "14px",
                position: "sticky",
                top: 0,
                zIndex: 10
              }}>
                <div>Customer</div>
                <div>Referral Code</div>
                <div>Used Count</div>
                <div>Actions</div>
              </div>

              {/* Table Rows - Metafields se data show karo */}
              {filteredCustomersWithReferrals.length > 0 ? (
                filteredCustomersWithReferrals.map((customer, index) => (
                  <div
                    key={customer.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr 1.5fr",
                      gap: "16px",
                      padding: "16px 20px",
                      borderBottom: index === filteredCustomersWithReferrals.length - 1 ? "none" : "1px solid #f7fafc",
                      alignItems: "center",
                      background: index % 2 === 0 ? "#fafafa" : "white",
                      transition: "background 0.2s"
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "600", color: "#2d3748" }}>{customer.name}</div>
                      <div style={{ color: "#718096", fontSize: "12px" }}>{customer.email}</div>
                    </div>

                    <div style={{
                      fontFamily: "'Fira Code', monospace",
                      fontWeight: "600",
                      color: "#3182ce",
                      fontSize: "14px"
                    }}>
                      {customer.referralCode}
                    </div>

                    <div style={{
                      fontWeight: "600",
                      color: (customer.referralsCount || 0) > 0 ? "#38a169" : "#a0aec0",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}>
                      {(customer.referralsCount || 0) > 0 && (
                        <span style={{
                          display: "inline-block",
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: "#38a169"
                        }}></span>
                      )}
                      {customer.referralsCount || 0} {(customer.referralsCount || 0) === 1 ? 'use' : 'uses'}
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => copyToClipboard(customer.referralCode)}
                        style={{
                          padding: "6px 12px",
                          background: "#3182ce",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: "500",
                          transition: "all 0.2s",
                          flex: 1
                        }}
                      >
                        Copy Code
                      </button>
                      <button
                        onClick={() => copyToClipboard(`https://${shopDomain}/?ref=${customer.referralCode}`, true)}
                        style={{
                          padding: "6px 12px",
                          background: "#38a169",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: "500",
                          transition: "all 0.2s",
                          flex: 1
                        }}
                      >
                        Copy URL
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "#718096",
                  fontSize: "16px"
                }}>
                  No referral codes found matching your search.
                </div>
              )}
            </div>

            {/* Summary Stats */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "20px",
              padding: "16px",
              background: "#f7fafc",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              fontSize: "14px",
              color: "#4a5568"
            }}>
              <div>
                <strong>Total Codes:</strong> {customersWithReferrals.length}
              </div>
              <div>
                <strong>Active Codes:</strong> {customersWithReferralCodes}
              </div>
              <div>
                <strong>Total Referrals:</strong> {totalReferrals}
              </div>
              <div>
                <strong>Showing:</strong> {filteredCustomersWithReferrals.length} codes
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div
          id="createModal"
          style={{
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
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              border: '1px solid #e2e8f0'
            }}
            onClick={(e) => e.stopPropagation()}
          >
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
                Create New Referral
              </h2>
              <button
                onClick={closeCreateModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#718096',
                  padding: '4px',
                  borderRadius: '4px'
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
                Select Customer
              </label>
              <select
                ref={modalSelectRef}
                style={{ width: '100%' }}
                disabled={!select2Ready}
              >
                <option value=""></option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} - {customer.email}
                  </option>
                ))}
              </select>
            </div>

            {modalSelectedCustomer && (
              <div style={{
                padding: "16px",
                backgroundColor: "#f0fff4",
                borderRadius: "8px",
                marginBottom: "20px",
                border: "1px solid #9ae6b4"
              }}>
                <h3 style={{
                  margin: "0 0 8px 0",
                  color: "#2d3748",
                  fontSize: "16px",
                  fontWeight: "600"
                }}>
                  {modalSelectedCustomer.name}
                </h3>
                <p style={{ margin: "4px 0", color: "#4a5568", fontSize: "14px" }}>
                  <strong>Email:</strong> {modalSelectedCustomer.email}
                </p>
                {modalSelectedCustomer.referralCode && (
                  <div style={{
                    marginTop: "8px",
                    padding: "6px 10px",
                    background: "#c6f6d5",
                    color: "#22543d",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: "500"
                  }}>
                    Already has referral code: {modalSelectedCustomer.referralCode}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => generateReferralCode(modalSelectedCustomer)}
              disabled={loading || !modalSelectedCustomer || modalSelectedCustomer.referralCode || !select2Ready}
              style={{
                background: !modalSelectedCustomer || modalSelectedCustomer.referralCode ? "#e2e8f0" :
                  loading ? "#e2e8f0" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: !modalSelectedCustomer || modalSelectedCustomer.referralCode ? "#a0aec0" : "white",
                padding: "12px 24px",
                border: "none",
                borderRadius: "8px",
                cursor: (loading || !modalSelectedCustomer || modalSelectedCustomer.referralCode || !select2Ready) ? "not-allowed" : "pointer",
                fontSize: "16px",
                fontWeight: "600",
                width: "100%",
                transition: "all 0.2s",
                boxShadow: !modalSelectedCustomer || modalSelectedCustomer.referralCode ? "none" : "0 2px 4px rgba(102, 126, 234, 0.3)"
              }}
            >
              {!select2Ready ? "Loading..." :
                loading ? "Generating..." :
                  !modalSelectedCustomer ? "Select a Customer" :
                    modalSelectedCustomer.referralCode ? "Already Generated" : "Generate Referral Code"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}