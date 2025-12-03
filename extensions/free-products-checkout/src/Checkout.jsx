import '@shopify/ui-extensions/preact';
import { render } from "preact";
import { useState, useEffect } from "preact/hooks";

const API_BASE_URL = "https://downloading-amazing-slightly-records.trycloudflare.com";
const VERIFY_REFERRAL_URL = `${API_BASE_URL}/api/verify-referral`;
const VERIFY_CLAIM_REWARD_URL = `${API_BASE_URL}/api/verify-claim-reward`;
const REFERRAL_SETTINGS_URL = `${API_BASE_URL}/api/referral-setting`;
const CREATE_DISCOUNT_URL = `${API_BASE_URL}/api/create-automatic-discount`;
console.log("🔧 API URLs:" + REFERRAL_SETTINGS_URL)
export default async () => {
  render(<Extension />, document.body)
};

function Extension() {
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [appliedDiscountCode, setAppliedDiscountCode] = useState('');
  const [isClaimReward, setIsClaimReward] = useState(false);
  const [matchedProduct, setMatchedProduct] = useState(null);

  useEffect(() => {
    verifyAndApplyReferral();
  }, []);

  // ✅ ATTRIBUTES MEIN SE REFERRAL DATA GET KARO
  const getReferralDataFromAttributes = async () => {
    try {
      console.log("🔍 Getting referral/claim data from Shopify attributes...");
      
      if (!shopify.attributes || !Array.isArray(shopify.attributes.current)) {
        console.log("ℹ️ No attributes found");
        return null;
      }

      const currentAttributes = shopify.attributes.current;
      
      // ✅ PEHLE CLAIM TOKEN CHECK KARO
      for (let attr of currentAttributes) {
        if (attr.key === 'claim_reward_token' && attr.value) {
          console.log("🎯 Found claim_reward_token:", attr.value.substring(0, 20) + "...");
          setIsClaimReward(true);
          return {
            type: 'claim_reward',
            token: attr.value,
            value: attr.value
          };
        }
      }
      
      // ✅ PHIR REGULAR REFERRAL CODE CHECK KARO
      for (let attr of currentAttributes) {
        if (attr.key === 'referral_code' && attr.value) {
          console.log("✅ Found referral_code:", attr.value);
          setIsClaimReward(false);
          return {
            type: 'referral_code',
            code: attr.value,
            value: attr.value
          };
        }
      }
      
      console.log("ℹ️ No referral or claim data found in attributes");
      return null;
    } catch (error) {
      console.error("🔥 Error getting referral data:", error);
      return null;
    }
  };

  // ✅ CLAIM TOKEN VERIFY KARO AUR REFERRAL COUNT GET KARO
  const verifyClaimTokenAndGetData = async (claimToken) => {
    try {
      console.log("🔐 Verifying claim token...");
      
      const verifyResponse = await fetch(VERIFY_CLAIM_REWARD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: claimToken })
      });

      const verifyData = await verifyResponse.json();
      console.log("📦 Claim token verification result:", verifyData);

      if (verifyData.success && verifyData.isValid && verifyData.data) {
        console.log("✅ Claim token verified successfully");
        
        return {
          success: true,
          isValid: true,
          referralCode: verifyData.data.referralCode,
          referralCount: verifyData.data.referralCount,
          customerEmail: verifyData.data.customerEmail,
          customerName: verifyData.data.customerName,
          message: "Claim reward verified successfully"
        };
      } else {
        return {
          success: false,
          isValid: false,
          message: verifyData.message || 'Invalid claim token'
        };
      }
    } catch (error) {
      console.error("🔥 Claim token verification error:", error);
      return {
        success: false,
        isValid: false,
        message: 'Claim verification failed'
      };
    }
  };

  // ✅ REGULAR REFERRAL CODE VERIFY KARO AUR REFERRAL COUNT GET KARO
  const verifyRegularReferralAndGetData = async (code) => {
    try {
      console.log("🔐 Verifying referral code...");
      console.log("Referral code to verify:", code);
      const verifyResponse = await fetch(VERIFY_REFERRAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralCode: code })
      });
      console.log("📡 Referral code verification response status:", verifyResponse);

      const verifyData = await verifyResponse.json();
      console.log("📦 Regular referral verification result:", verifyData);

      if (verifyData.success && verifyData.isValid ) {
        return {
          success: true,
          isValid: true,
          referralCode: code,
          referralCount: verifyData.stats.referralCode || 0,
          customerEmail: verifyData.customer.email,
          customerName: verifyData.customer.name,
          message: "Referral verified successfully"
        };
      } else {
        return {
          success: false,
          isValid: false,
          message: verifyData.message || 'Invalid referral code'
        };
      }
    } catch (error) {
      console.error("🔥 Referral verification error:", error);
      return {
        success: false,
        isValid: false,
        message: 'Referral verification failed'
      };
    }
  };

  // ✅ REFERRAL SETTINGS SE PRODUCT MATCH KARO
const getMatchedProductFromSettings = async (referralCount) => {
  try {
    
    console.log("🔧 Getting matched product for referral count:", referralCount);
    
    // ✅ REFERRAL SETTINGS API SE DATA LEKE AISE HI LOGIC APPLY KARO
    const settingsResponse = await fetch(REFERRAL_SETTINGS_URL);

    console.log("📡 Referral settings API response status:", settingsResponse.status);
    const settingsData = await settingsResponse.json();
    
    console.log("📊 Referral settings response:", settingsData);
    
    if (!settingsData.success || !settingsData.data) {
      console.log("❌ No referral settings found");
      return null;
    }

    const referralSettings = settingsData.data;
    
    // ✅ Parse referral rewards (EXACTLY TUMHARE BACKEND KI TARAH)
    let settingsDataParsed = {};
    
    // Check if it's already an object or needs parsing
    if (typeof referralSettings.referralRewards === 'object') {
      settingsDataParsed = referralSettings.referralRewards;
    } else if (referralSettings.referralRewards) {
      // Try to parse if it's a string
      try {
        settingsDataParsed = JSON.parse(referralSettings.referralRewards);
      } catch (e) {
        settingsDataParsed = referralSettings.referralRewards;
      }
    } else {
      settingsDataParsed = referralSettings;
    }

    console.log("📋 Parsed settings data:", settingsDataParsed);

    // ✅ Check if rewards exist (EXACTLY TUMHARE BACKEND KI TARAH)
    if (!settingsDataParsed.rewards || !Array.isArray(settingsDataParsed.rewards) || settingsDataParsed.rewards.length === 0) {
      console.log("❌ No rewards configured in settings");
      return null;
    }

    console.log("User's referral count:", referralCount);
    console.log("Available rewards:", settingsDataParsed.rewards);

    // ✅ Convert user's referral count to number for comparison
    const userCount = parseInt(referralCount) || 0;

    // ✅ Sort by referralCount (convert to number for sorting) - EXACTLY TUMHARE BACKEND KI TARAH
    const sortedRewards = settingsDataParsed.rewards.sort((a, b) => {
      const aCount = parseInt(a.referralCount) || 0;
      const bCount = parseInt(b.referralCount) || 0;
      return aCount - bCount;
    });

    console.log("Sorted rewards:", sortedRewards);
    
    // ✅ Find highest reward that user qualifies for - EXACTLY TUMHARE BACKEND KI TARAH
    let matchedReward = null;
    
    for (const reward of sortedRewards) {
      const requiredCount = parseInt(reward.referralCount) || 0;
      
      if (userCount >= requiredCount) {
        matchedReward = reward;
        console.log(`✅ User qualifies for: ${requiredCount} referrals -> Product: ${reward.referrerProduct}`);
      } else {
        break; // Stop since rewards are sorted ascending
      }
    }

    if (matchedReward) {
      const result = {
        referralCountRequired: parseInt(matchedReward.referralCount),
        productId: matchedReward.referrerProduct,
        description: `Earned for ${matchedReward.referralCount} referrals`,
        // Extract product ID from Shopify GID
        shopifyProductId: matchedReward.referrerProduct.replace('gid://shopify/Product/', ''),
        rewardId: matchedReward.id
      };
      
      console.log("🎁 Matched product found:", result);
      setMatchedProduct(result);
      return result.productId;
    } else {
      console.log("⚠️ User doesn't qualify for any reward yet");
      return null;
    }

  } catch (error) {
    console.error("🔥 Error in getMatchedProductFromSettings:", error);
    return null;
  }
};
  // ✅ ORDER ATTRIBUTES MEIN DATA ADD KARO
  const addReferralDataToAttributes = async (referralCode, discountCode, isClaimReward = false, matchedProduct = null) => {
    try {
      console.log("📝 Adding referral data to attributes:", { 
        referralCode, 
        discountCode,
        isClaimReward,
        matchedProduct 
      });
      
      // ✅ Check if auto discount was applied successfully
      const discountApplied = await checkAutoDiscountApplied();
      
      if (!discountApplied) {
        console.log("❌ Auto discount not applied, skipping webhook processing");
        return;
      }

      // ✅ Referral code add karo
      if (typeof shopify.applyAttributeChange === 'function') {
        await shopify.applyAttributeChange({
          key: 'referral_code_used',
          value: referralCode,
          type: 'updateAttribute'
        });

        // ✅ Discount code add karo
        await shopify.applyAttributeChange({
          key: 'applied_discount_code',
          value: discountCode,
          type: 'updateAttribute'
        });

        // ✅ Claim reward flag add karo
        if (isClaimReward) {
          await shopify.applyAttributeChange({
            key: 'is_claim_reward',
            value: 'true',
            type: 'updateAttribute'
          });
        }

        // ✅ Matched product add karo
        if (matchedProduct) {
          await shopify.applyAttributeChange({
            key: 'matched_reward_product',
            value: matchedProduct.referrerProduct || matchedProduct.productId || JSON.stringify(matchedProduct),
            type: 'updateAttribute'
          });
        }

        console.log("✅ Referral data added to attributes for webhook");
      }
    } catch (error) {
      console.error("🔥 Error adding referral data to attributes:", error);
    }
  };

  // ✅ CHECK IF AUTO DISCOUNT WAS APPLIED SUCCESSFULLY
  const checkAutoDiscountApplied = async () => {
    try {
      console.log("🔍 Checking if auto discount was applied...");
      
      if (shopify.discountCodes && Array.isArray(shopify.discountCodes.current)) {
        const currentDiscounts = shopify.discountCodes.current;
        const hasAppliedDiscount = currentDiscounts.length > 0;
        console.log("✅ Auto discount applied status:", hasAppliedDiscount);
        return hasAppliedDiscount;
      }
      return false;
    } catch (error) {
      console.error("🔥 Error checking discount application:", error);
      return false;
    }
  };

  const verifyAndApplyReferral = async () => {
    try {
      console.log("🔍 Starting referral/claim verification...");

      const referralData = await getReferralDataFromAttributes();
      if (!referralData) {
        console.log("❌ No referral code or claim token found");
        setStatus('no_referral');
        return;
      }

      await removeExistingDiscounts();

      let verifyResult = null;
      let productGid = null;

      // ✅ STEP 1: VERIFY BASED ON TYPE
      if (referralData.type === 'claim_reward') {
        console.log("🎯 Processing CLAIM REWARD...");
        
        verifyResult = await verifyClaimTokenAndGetData(referralData.token);
        
        if (verifyResult.success && verifyResult.isValid) {
          console.log("✅ Claim reward verified");
          setReferralCode(verifyResult.referralCode);
          
          // ✅ STEP 2: REFERRAL SETTINGS SE PRODUCT MATCH KARO
          productGid = await getMatchedProductFromSettings(verifyResult.referralCount);
          console.log("🔧 Matched product GID for claim reward:", productGid);
          
          if (productGid) {
            // ✅ STEP 3: DISCOUNT CREATE KARO
            await createAndApplyDiscount(
              verifyResult.referralCode, 
              productGid, 
              true, // isClaimReward
              verifyResult.referralCount
            );
          } else {
            setStatus('no_products');
            setMessage("No matching reward found for your referral count");
          }
        } else {
          setStatus('invalid');
          setMessage(verifyResult.message || 'Invalid claim token');
        }
        return;
      }

      // ✅ REGULAR REFERRAL PROCESS
      if (referralData.type === 'referral_code') {
        console.log("🎯 Processing REGULAR REFERRAL...");
        setReferralCode(referralData.code);
        
        verifyResult = await verifyRegularReferralAndGetData(referralData.code);
        console.log("🔧 Regular referral verification result:", verifyResult);
        if (verifyResult.success && verifyResult.isValid) {
          console.log("✅ Regular referral verified");
          
          // ✅ STEP 2: REFERRAL SETTINGS SE PRODUCT MATCH KARO
         productGid = await getFixedRefereeProductFromSettings();

          console.log("🔧 Matched product GID for regular referral:", productGid);
          
          if (productGid) {
            // ✅ STEP 3: DISCOUNT CREATE KARO
            await createAndApplyDiscount(
              verifyResult.referralCode, 
              productGid, 
              false, // isClaimReward
              verifyResult.referralCount
            );
          } else {
            setStatus('no_products');
            setMessage("No matching reward found for your referral count");
          }
        } else {
          
          setStatus('invalid');
          setMessage(verifyResult.message || 'Invalid referral code');
        }
      }

    } catch (error) {
      console.error("🔥 Verification error:", error);
      setStatus('error');
      setMessage('Verification failed');
    }
  };

  // ✅ DISCOUNT CREATE KARNE KA FUNCTION
  const createAndApplyDiscount = async (code, productGid, isClaimReward, referralCount) => {
    try {
      console.log("🎫 Creating discount via Remix API...");

      const productId = productGid.replace('gid://shopify/Product/', '');
      console.log("📦 Product ID for discount:", productId);

      const discountResponse = await fetch(CREATE_DISCOUNT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referralCode: code,
          productId: productId,
          isClaimReward: isClaimReward,
          referralCount: referralCount
        })
      });

      if (!discountResponse.ok) {
        const errorText = await discountResponse.text();
        console.error("🔥 Discount API error:", discountResponse.status, errorText);
        throw new Error(`API error: ${discountResponse.status}`);
      }

      const discountData = await discountResponse.json();
      console.log("💰 Discount creation result:", discountData);

      if (discountData.success) {
        const discountCode = discountData.discountCode;
        console.log("✅ Discount created:", discountCode);
        
        // ✅ Apply the discount code
        await shopify.applyDiscountCodeChange({
          type: 'addDiscountCode',
          code: discountCode
        });

        console.log("✅ Discount code applied successfully");
        
        // ✅ Discount code state mein save karo
        setAppliedDiscountCode(discountCode);
        
        // ✅ ATTRIBUTES MEIN DATA ADD KARO
        await addReferralDataToAttributes(code, discountCode, isClaimReward, matchedProduct);
        
        setStatus('applied');
        setMessage(isClaimReward 
          ? `🎉 Claim reward redeemed! You qualified for ${referralCount} referrals.` 
          : `🎉 Referral applied! You qualified for ${referralCount} referrals.`);
        
      } else {
        console.log("❌ Discount creation failed:", discountData.error);
        setStatus('error');
        setMessage('Discount creation failed. Please try again.');
      }

    } catch (error) {
      console.error("🔥 Discount error:", error);
      setStatus('error');
      setMessage('Discount application failed. Please try again.');
    }
  };

  // ✅ EXISTING DISCOUNTS REMOVE KARNE KA FUNCTION
  const removeExistingDiscounts = async () => {
    try {
      console.log("🗑️ Removing existing discounts...");
      
      if (shopify.discountCodes && Array.isArray(shopify.discountCodes.current)) {
        const currentDiscounts = shopify.discountCodes.current;
        console.log("🎫 Current discounts to remove:", currentDiscounts);
        
        for (let discount of currentDiscounts) {
          try {
            await shopify.applyDiscountCodeChange({
              type: 'removeDiscountCode',
              code: discount.code
            });
            console.log(`✅ Removed discount: ${discount.code}`);
          } catch (removeError) {
            console.log(`⚠️ Could not remove discount: ${discount.code}`, removeError.message);
          }
        }
      } else {
        console.log("ℹ️ No existing discounts found");
      }
      
    } catch (error) {
      console.error("🔥 Remove discounts error:", error);
    }
  };

  // UI rendering
  const getBannerContent = () => {
    switch (status) {
      case 'applied':
        return (
          <s-banner heading={isClaimReward ? "✅ Claim Reward Redeemed!" : "🎉 Referral Applied!"} tone="success">
            <s-stack gap="base">
              <s-text>{message}</s-text>
              {matchedProduct && (
                <s-text>
                  Reward: {matchedProduct.referralCount || ''} referrals → {matchedProduct.referrerProduct ? 'Product' : 'Reward'}
                </s-text>
              )}
              <s-text>Discount code: {appliedDiscountCode}</s-text>
              <s-text>{isClaimReward ? 'Claim reward' : 'Referral code'} will be processed after order completion.</s-text>
            </s-stack>
          </s-banner>
        );
      case 'invalid':
        return (
          <s-banner heading="❌ Invalid Referral/Claim" tone="critical">
            <s-text>{message}</s-text>
          </s-banner>
        );
      case 'no_products':
        return (
          <s-banner heading="📦 No Matching Reward" tone="warning">
            <s-stack gap="base">
              <s-text>{message}</s-text>
              {referralCode && (
                <s-text>Your referral code: {referralCode}</s-text>
              )}
            </s-stack>
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
          <s-banner heading="⏳ Processing..." tone="info">
            <s-stack gap="base">
              <s-text>{isClaimReward ? 'Verifying claim reward...' : 'Applying referral benefits...'}</s-text>
              <s-text>Matching reward based on your referral count...</s-text>
            </s-stack>
          </s-banner>
        );
      default:
        return null;
    }
  };

  return getBannerContent();
}

async function getFixedRefereeProductFromSettings() {
  const settingsResponse = await fetch(REFERRAL_SETTINGS_URL);

  console.log("📡 Referral settings API response status:", settingsResponse.status);

  const settingsData = await settingsResponse.json();

  // extract the product
  const fixedRefereeProduct =
    settingsData?.data?.referralRewards?.fixedRefereeProduct;

  return fixedRefereeProduct;
}