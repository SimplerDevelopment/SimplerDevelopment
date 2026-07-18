/**
 * Test file for design save functionality
 * This tests the core design saving features in the ProductDesigner
 */

// Mock design data for testing
const mockDesignData = {
  name: "Test Design - T-Shirt",
  designName: "Test Design",
  productId: "123",
  styleId: 1,
  side: "front",
  layers: [
    {
      id: "layer-1",
      type: "text",
      data: { text: "Hello World" },
      x: 100,
      y: 100,
      scale: 1,
      rotation: 0
    },
    {
      id: "layer-2", 
      type: "image",
      data: { src: "/test-image.jpg" },
      x: 200,
      y: 150,
      scale: 0.8,
      rotation: 45
    }
  ],
  styleOverrides: {
    backgroundColor: "#ffffff",
    textColor: "#000000"
  },
  userId: 1
};

const mockStoreConfigurations = [
  {
    storeId: 1,
    storeName: "Main Store",
    quantities: [
      { sizeId: 1, sizeName: "Medium", quantity: 10 },
      { sizeId: 2, sizeName: "Large", quantity: 15 }
    ],
    customizations: {
      price: 25.99,
      description: "Custom designed t-shirt with personalized text and graphics",
      tags: ["custom", "designed", "t-shirt"]
    }
  },
  {
    storeId: 2,
    storeName: "Secondary Store", 
    quantities: [
      { sizeId: 1, sizeName: "Medium", quantity: 5 },
      { sizeId: 3, sizeName: "XL", quantity: 8 }
    ],
    customizations: {
      price: 27.99,
      description: "Premium custom t-shirt design",
      tags: ["premium", "custom"]
    }
  }
];

// Test the design save API endpoint
async function testDesignSaveAPI() {
  console.log('🧪 Testing Design Save API...');
  
  try {
    // Test creating a new design
    const createResponse = await fetch('/api/designs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: mockDesignData.name,
        productId: mockDesignData.productId,
        styleId: mockDesignData.styleId,
        side: mockDesignData.side,
        layers: mockDesignData.layers,
        styleOverrides: mockDesignData.styleOverrides,
        userId: mockDesignData.userId,
        description: "Test design for API validation"
      })
    });

    if (createResponse.ok) {
      const savedDesign = await createResponse.json();
      console.log('✅ Design created successfully:', savedDesign.id);
      
      // Test updating the design
      const updateResponse = await fetch(`/api/designs/${savedDesign.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: mockDesignData.name + " (Updated)",
          layers: [
            ...mockDesignData.layers,
            {
              id: "layer-3",
              type: "text", 
              data: { text: "Updated Layer" },
              x: 50,
              y: 50,
              scale: 1.2,
              rotation: 0
            }
          ]
        })
      });

      if (updateResponse.ok) {
        const updatedDesign = await updateResponse.json();
        console.log('✅ Design updated successfully:', updatedDesign.name);
      } else {
        console.error('❌ Failed to update design:', updateResponse.statusText);
      }

      return savedDesign.id;
    } else {
      console.error('❌ Failed to create design:', createResponse.statusText);
      return null;
    }
  } catch (error) {
    console.error('❌ Design Save API test failed:', error);
    return null;
  }
}

// Test the store assignment with design save
async function testStoreAssignmentWithDesignSave() {
  console.log('🧪 Testing Store Assignment with Design Save...');
  
  try {
    const response = await fetch('/api/catalog/assign-designed-product-to-store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        designData: mockDesignData,
        storeConfigurations: mockStoreConfigurations,
        userId: mockDesignData.userId
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Store assignment successful:', {
        designId: result.designData.id,
        assignedStores: result.summary.successful,
        totalStores: result.summary.total
      });

      if (result.summary.failed > 0) {
        console.warn('⚠️ Some store assignments failed:', result.errors);
      }

      return result;
    } else {
      const error = await response.json();
      console.error('❌ Store assignment failed:', error.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Store assignment test failed:', error);
    return null;
  }
}

// Test retrieving saved designs
async function testDesignRetrieval(userId = 1) {
  console.log('🧪 Testing Design Retrieval...');
  
  try {
    const response = await fetch(`/api/designs?userId=${userId}`);
    
    if (response.ok) {
      const designs = await response.json();
      console.log(`✅ Retrieved ${designs.length} designs for user ${userId}`);
      
      designs.forEach(design => {
        console.log(`  - Design: ${design.name} (ID: ${design.id}, Layers: ${design.layers?.length || 0})`);
      });

      return designs;
    } else {
      console.error('❌ Failed to retrieve designs:', response.statusText);
      return [];
    }
  } catch (error) {
    console.error('❌ Design retrieval test failed:', error);
    return [];
  }
}

// Run all tests
async function runDesignSaveTests() {
  console.log('🚀 Starting Design Save Functionality Tests...\n');
  
  // Test 1: Basic design save API
  const designId = await testDesignSaveAPI();
  console.log('');

  // Test 2: Store assignment with design save
  const assignmentResult = await testStoreAssignmentWithDesignSave();
  console.log('');

  // Test 3: Design retrieval
  const retrievedDesigns = await testDesignRetrieval(mockDesignData.userId);
  console.log('');

  // Summary
  console.log('📊 Test Summary:');
  console.log(`  - Design Save API: ${designId ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  - Store Assignment: ${assignmentResult?.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  - Design Retrieval: ${retrievedDesigns.length > 0 ? '✅ PASSED' : '❌ FAILED'}`);
  
  const allTestsPassed = designId && assignmentResult?.success && retrievedDesigns.length > 0;
  console.log(`\n🏁 Overall Result: ${allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  return allTestsPassed;
}

// Export for use in other test files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runDesignSaveTests,
    testDesignSaveAPI,
    testStoreAssignmentWithDesignSave,
    testDesignRetrieval,
    mockDesignData,
    mockStoreConfigurations
  };
}

// Auto-run tests if this file is executed directly in a browser console
if (typeof window !== 'undefined') {
  // Browser environment - provide global access
  window.runDesignSaveTests = runDesignSaveTests;
  window.designSaveTestData = { mockDesignData, mockStoreConfigurations };
  
  console.log('🎯 Design Save Tests loaded! Run: window.runDesignSaveTests()');
}