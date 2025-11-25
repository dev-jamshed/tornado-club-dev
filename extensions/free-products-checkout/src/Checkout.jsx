import '@shopify/ui-extensions/preact';
import {render} from "preact";
import {useState, useEffect} from "preact/hooks";

export default async () => {
  render(<Extension />, document.body)
};

function Extension() {
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    verifyAndApplyReferral();
  }, []);

  const getReferralCode = async () => {
    try {
      console.log("🔍 Getting referral code from Shopify attributes...");
      
      // Shopify attributes se referral code get karein
      const attributes = await shopify.attributes;

      
      console.log("📦 All Attributes:", attributes);
      
      if (attributes && Array.isArray(attributes) && attributes.length > 0) {
        for (let attr of attributes) {
          console.log(`🔍 Checking attribute: ${attr.key} = ${attr.value}`);
          if (attr.key === 'referral_code') {
            console.log("✅ Found referral code in attributes:", attr.value);
            return attr.value;
          }
        }
      }
      
      console.log("❌ No referral_code found in attributes");
      return null;
      
    } catch (error) {
      console.error("🔥 Error getting referral code:", error);
      return null;
    }
  };

  const verifyAndApplyReferral = async () => {
    try {

      
      console.log("🔍 Starting referral verification...");

      // Referral code get karein
      const referralCode = await getReferralCode();

      if (!referralCode) {
        console.log("❌ No referral code found");
        setStatus('no_referral');
        return;
      }

      console.log("📦 Using referral code:", referralCode);

      // ✅ API se verify karein
      console.log("🌐 Calling verification API...");
      const verifyResponse = await fetch('https://northeast-letter-calvin-namespace.trycloudflare.com/api/verify-referral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          referralCode: referralCode
        })
      });

      const verifyData = await verifyResponse.json();
      console.log("📦 API verification result:", verifyData);
      console.log("🔍 Verification success:", verifyData.success, "isValid:", verifyData.isValid);
      if (verifyData.success && verifyData.isValid) {
        console.log("✅ Valid referral - applying benefits");
        await applyFreeProducts(verifyData.data);
      } else {
        console.log("❌ Invalid referral:", verifyData.message);
        setStatus('invalid');
        setMessage(verifyData.message || 'Invalid referral code');
      }

    } catch (error) {
      console.error("🔥 Verification error:", error);
      setStatus('error');
      setMessage('Verification failed: ' + error.message);
    }
  };

  const applyFreeProducts = async (referralData) => {
    try {
      console.log("🎁 Applying free products:", referralData);
      
      const freeProducts = referralData.fixedRefereeProducts || [];
      
      if (freeProducts.length > 0) {
        // Apply verified products attribute
        await shopify.applyAttributeChange({
          key: 'verified_referral',
          type: 'updateAttribute',
          value: JSON.stringify({
            products: freeProducts,
            referralCode: referralData.referralCode,
            verifiedAt: new Date().toISOString()
          })
        });
        
        setStatus('applied');
        setMessage(`🎉 ${freeProducts.length} free products applied!`);
        console.log("✅ Referral benefits applied successfully");
        
      } else {
        setStatus('no_products');
        setMessage("No free products available for this referral");
      }

    } catch (error) {
      console.error("🔥 Products apply error:", error);
      setStatus('error');
      setMessage('Error applying benefits: ' + error.message);
    }
  };

  // UI rendering
  const getBannerContent = () => {
    switch (status) {
      case 'applied':
        return (
          <s-banner heading="🎉 Referral Applied!" tone="success">
            <s-stack gap="base">
              <s-text>{message}</s-text>
            </s-stack>
          </s-banner>
        );
      
      case 'invalid':
        return (
          <s-banner heading="❌ Invalid Referral" tone="critical">
            <s-text>{message}</s-text>
          </s-banner>
        );
      
      case 'no_products':
        return (
          <s-banner heading="📦 No Products Available" tone="warning">
            <s-text>{message}</s-text>
          </s-banner>
        );
      
      case 'error':
        return (
          <s-banner heading="⚠️ System Error" tone="critical">
            <s-text>{message}</s-text>
          </s-banner>
        );
      
      case 'no_referral':
        return null;
      
      case 'loading':
        return (
          <s-banner heading="⏳ Verifying Referral..." tone="info">
            <s-text>Checking your referral benefits...</s-text>
          </s-banner>
        );
      
      default:
        return null;
    }
  };

  return getBannerContent();
}