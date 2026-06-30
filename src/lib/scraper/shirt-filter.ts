export function filterShirts(products: any[]) {
  const allowList = ['shirt', 'oxford', 'flannel', 'chambray', 'henley', 'polo', 'overshirt', 'blouse'];
  const blockList = ['jeans', 'shoes', 'jacket', 'bag', 'hat', 'belt', 'pants', 'socks', 'underwear', 'shorts', 'trouser', 'skirt', 'sweater', 'hoodie'];

  return products.filter(product => {
    const textToSearch = `${product.name} ${product.sourceUrl}`.toLowerCase();
    
    // If it contains a blocked word, reject immediately
    if (blockList.some(word => textToSearch.includes(word))) {
      return false;
    }
    
    // If it contains an allowed word, keep it
    if (allowList.some(word => textToSearch.includes(word))) {
      return true;
    }
    
    // If it matches neither, we reject it to save AI costs.
    return false;
  });
}
