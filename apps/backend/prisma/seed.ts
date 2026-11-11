import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  STAFF_ROLES,
} from '@nodedr-restaurant/types';

function ensureUploads() {
  const possibleDirs = [
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(process.cwd(), 'apps/backend/uploads'),
    '/repo/apps/backend/uploads',
  ];
  const sourceDir = possibleDirs.find((d) => fs.existsSync(d));
  const targetDir = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : sourceDir;

  if (sourceDir && targetDir && targetDir !== sourceDir && fs.existsSync(sourceDir)) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const files = fs.readdirSync(sourceDir);
    for (const file of files) {
      const srcFile = path.join(sourceDir, file);
      const dstFile = path.join(targetDir, file);
      if (!fs.existsSync(dstFile)) {
        try {
          fs.copyFileSync(srcFile, dstFile);
        } catch {}
      }
    }
  }
}

// Deliberately not imported from src/modules/orders/pricing — the runtime
// image only ships apps/backend/dist + prisma (see ARCHITECTURE.md /
// install.sh packaging notes), so `src/` doesn't exist to import from once
// this script runs via a container's `npx ts-node prisma/seed.ts`. Same
// tax-inclusive math as OrdersService.priceLine, kept tiny and duplicated
// on purpose rather than reaching across that packaging boundary.
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function priceLine(
  quantity: number,
  unitPriceInclusive: number,
  taxRatePercent: number,
) {
  const lineTotal = round2(unitPriceInclusive * quantity);
  const rate = taxRatePercent / 100;
  const taxAmount = rate > 0 ? round2(lineTotal - lineTotal / (1 + rate)) : 0;
  return { lineTotal, taxAmount };
}

const prisma = new PrismaClient();

async function main() {
  ensureUploads();
  console.log('Seeding permissions...');
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { label: permission.label, category: permission.category },
      create: permission,
    });
  }
  const allPermissions = await prisma.permission.findMany();
  const permissionByKey = new Map(allPermissions.map((p) => [p.key, p]));

  console.log('Creating demo restaurant + branch...');
  const restaurant = await prisma.restaurant.upsert({
    where: { id: 'demo-restaurant' },
    update: {
      name: 'UrbanBite Restaurant',
      currency: 'BDT',
      timezone: 'Asia/Dhaka',
    },
    create: {
      id: 'demo-restaurant',
      name: 'UrbanBite Restaurant',
      currency: 'BDT',
      timezone: 'Asia/Dhaka',
    },
  });

  const branch = await prisma.branch.upsert({
    where: { id: 'demo-branch' },
    update: {
      name: 'Main Branch',
      country: 'BD',
      taxRegime: 'CUSTOM',
      taxLabel: 'VAT',
      receiptFooter: 'Thank you for dining at UrbanBite Restaurant! Please visit again.',
      serviceChargePercent: 0,
      vatPercent: 5,
    },
    create: {
      id: 'demo-branch',
      restaurantId: restaurant.id,
      name: 'Main Branch',
      country: 'BD',
      taxRegime: 'CUSTOM',
      taxLabel: 'VAT',
      receiptFooter: 'Thank you for dining at UrbanBite Restaurant! Please visit again.',
      serviceChargePercent: 0,
      vatPercent: 5,
    },
  });

  console.log('Seeding roles...');
  const roleByName = new Map<string, string>();
  for (const roleName of STAFF_ROLES) {
    const role = await prisma.role.upsert({
      where: {
        restaurantId_name: { restaurantId: restaurant.id, name: roleName },
      },
      update: {},
      create: {
        restaurantId: restaurant.id,
        name: roleName,
        label: roleName.replace(/_/g, ' '),
      },
    });
    roleByName.set(roleName, role.id);

    const grantedKeys = DEFAULT_ROLE_PERMISSIONS[roleName];
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: grantedKeys
        .map((key) => permissionByKey.get(key))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
    });
  }

  console.log(
    'Creating demo owner user (login: owner@demo.local / password: abc123)...',
  );
  const passwordHash = await bcrypt.hash('abc123', 12);
  const pinHash = await bcrypt.hash('1234', 12);
  const ownerRoleId = roleByName.get('OWNER')!;

  const owner = await prisma.user.upsert({
    where: {
      restaurantId_email: {
        restaurantId: restaurant.id,
        email: 'owner@demo.local',
      },
    },
    update: {
      passwordHash,
      pinHash,
    },
    create: {
      restaurantId: restaurant.id,
      roleId: ownerRoleId,
      name: 'Demo Owner',
      email: 'owner@demo.local',
      passwordHash,
      pinHash,
    },
  });

  await prisma.userBranch.upsert({
    where: { userId_branchId: { userId: owner.id, branchId: branch.id } },
    update: {},
    create: { userId: owner.id, branchId: branch.id },
  });

  // Remove legacy test accounts if present to avoid clutter
  await prisma.user.deleteMany({
    where: {
      restaurantId: restaurant.id,
      email: {
        in: [
          'superadmin@urbanbite.local',
          'manager@urbanbite.local',
          'cashier@urbanbite.local',
          'waiter@urbanbite.local',
          'kitchen@urbanbite.local',
        ],
      },
    },
  }).catch(() => {});

  console.log('Seeding demo staff accounts (Password: abc123)...');
  const testStaffUsers = [
    {
      name: 'admin',
      email: 'admin@gmail.com',
      phone: null,
      roleName: 'SUPER_ADMIN',
    },
    {
      name: 'manager',
      email: 'manager@gmail.com',
      phone: null,
      roleName: 'MANAGER',
    },
    {
      name: 'cashier',
      email: 'cashier@gmail.com',
      phone: null,
      roleName: 'CASHIER',
    },
    {
      name: 'waiter',
      email: 'waiter@gmail.com',
      phone: null,
      roleName: 'WAITER',
    },
    {
      name: 'kitchen',
      email: 'kitchen@gmail.com',
      phone: null,
      roleName: 'KITCHEN_STAFF',
    },
  ];

  for (const s of testStaffUsers) {
    const roleId = roleByName.get(s.roleName) || ownerRoleId;
    const staffUser = await prisma.user.upsert({
      where: {
        restaurantId_email: {
          restaurantId: restaurant.id,
          email: s.email,
        },
      },
      update: {
        name: s.name,
        roleId,
        passwordHash,
        pinHash,
        isActive: true,
      },
      create: {
        restaurantId: restaurant.id,
        roleId,
        name: s.name,
        email: s.email,
        phone: s.phone,
        passwordHash,
        pinHash,
        isActive: true,
      },
    });

    await prisma.userBranch.upsert({
      where: {
        userId_branchId: { userId: staffUser.id, branchId: branch.id },
      },
      update: {},
      create: { userId: staffUser.id, branchId: branch.id },
    });
  }

  console.log('Seeding floor + tables...');
  const floor = await prisma.floor.upsert({
    where: { id: 'demo-floor' },
    update: { name: 'Main Dining Hall' },
    create: { id: 'demo-floor', branchId: branch.id, name: 'Main Dining Hall' },
  });

  for (let i = 1; i <= 8; i++) {
    const formatted = String(i).padStart(2, '0');
    await prisma.table.upsert({
      where: { floorId_number: { floorId: floor.id, number: formatted } },
      update: { name: `Table ${formatted}`, isActive: true },
      create: {
        floorId: floor.id,
        number: formatted,
        name: `Table ${formatted}`,
        capacity: i % 3 === 0 ? 6 : (i % 2 === 0 ? 4 : 2),
        status: i === 2 ? 'OCCUPIED' : (i === 4 ? 'RESERVED' : 'AVAILABLE'),
        isActive: true,
        posX: ((i - 1) % 4) * 120 + 20,
        posY: Math.floor((i - 1) / 4) * 120 + 20,
      },
    });
  }

  console.log('Seeding kitchen stations + menu...');
  const mainKitchen = await prisma.kitchenStation.upsert({
    where: { id: 'demo-station-main' },
    update: {},
    create: {
      id: 'demo-station-main',
      branchId: branch.id,
      name: 'Main Kitchen',
    },
  });
  const bar = await prisma.kitchenStation.upsert({
    where: { id: 'demo-station-bar' },
    update: {},
    create: { id: 'demo-station-bar', branchId: branch.id, name: 'Bar' },
  });

  console.log('Seeding UrbanBite food categories...');
  const categoryDefs = [
    { id: 'demo-cat-rice', name: 'Rice', sortOrder: 0 },
    { id: 'demo-cat-chicken', name: 'Chicken', sortOrder: 1 },
    { id: 'demo-cat-beef', name: 'Beef', sortOrder: 2 },
    { id: 'demo-cat-fish', name: 'Fish', sortOrder: 3 },
    { id: 'demo-cat-fastfood', name: 'Fast Food', sortOrder: 4 },
    { id: 'demo-cat-snacks', name: 'Snacks', sortOrder: 5 },
    { id: 'demo-cat-drinks', name: 'Drinks', sortOrder: 6 },
    { id: 'demo-cat-desserts', name: 'Desserts', sortOrder: 7 },
  ];

  const catMap = new Map<string, string>();
  for (const cat of categoryDefs) {
    const row = await prisma.menuCategory.upsert({
      where: { id: cat.id },
      update: { name: cat.name, sortOrder: cat.sortOrder, isActive: true },
      create: {
        id: cat.id,
        branchId: branch.id,
        name: cat.name,
        sortOrder: cat.sortOrder,
        isActive: true,
      },
    });
    catMap.set(cat.name, row.id);
  }

  // Backwards compatibility for legacy demo categories
  const starters = await prisma.menuCategory.upsert({
    where: { id: 'demo-cat-starters' },
    update: {},
    create: {
      id: 'demo-cat-starters',
      branchId: branch.id,
      name: 'Starters',
      sortOrder: 10,
    },
  });
  const mains = await prisma.menuCategory.upsert({
    where: { id: 'demo-cat-mains' },
    update: {},
    create: {
      id: 'demo-cat-mains',
      branchId: branch.id,
      name: 'Main Course',
      sortOrder: 11,
    },
  });
  const drinks = catMap.get('Drinks')!;

  const crustGroup = await prisma.modifierGroup.upsert({
    where: { id: 'demo-mg-crust' },
    update: {},
    create: {
      id: 'demo-mg-crust',
      branchId: branch.id,
      name: 'Crust Type',
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      modifiers: {
        connectOrCreate: [
          {
            where: { id: 'demo-mod-thin' },
            create: {
              id: 'demo-mod-thin',
              name: 'Thin Crust',
              priceAdjustment: 0,
              isDefault: true,
            },
          },
          {
            where: { id: 'demo-mod-thick' },
            create: {
              id: 'demo-mod-thick',
              name: 'Thick Crust',
              priceAdjustment: 0,
            },
          },
          {
            where: { id: 'demo-mod-cheese' },
            create: {
              id: 'demo-mod-cheese',
              name: 'Extra Cheese',
              priceAdjustment: 60,
            },
          },
        ],
      },
    },
  });

  const demoItems: {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    categoryId: string;
    stationId: string;
    price: number;
    taxRatePercent: number;
    isVeg: boolean;
    isAvailable?: boolean;
    modifierGroupId?: string;
  }[] = [
    // Rice
    {
      id: 'demo-item-biryani-chicken',
      name: 'Chicken Dum Biryani',
      description: 'Aromatic basmati rice cooked with tender marinated chicken and special spices.',
      imageUrl: '/api/uploads/demo-biryani.jpg',
      categoryId: catMap.get('Rice')!,
      stationId: mainKitchen.id,
      price: 320,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-biryani-kacchi',
      name: 'Beef Kacchi Biryani',
      description: 'Authentic spiced rice cooked with succulent beef chunks and golden potatoes.',
      imageUrl: '/api/uploads/demo-kacchi.jpg',
      categoryId: catMap.get('Rice')!,
      stationId: mainKitchen.id,
      price: 450,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-bhuna-khichuri',
      name: 'Bhuna Khichuri Platter',
      description: 'Slow-cooked lentil rice served with egg and special salad.',
      imageUrl: '/api/uploads/demo-khichuri.jpg',
      categoryId: catMap.get('Rice')!,
      stationId: mainKitchen.id,
      price: 220,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-fried-rice',
      name: 'Special Egg & Prawn Fried Rice',
      description: 'Wok-tossed fragrant basmati rice with scrambled egg, fresh scallions, and succulent prawns.',
      imageUrl: '/api/uploads/demo-fried-rice.jpg',
      categoryId: catMap.get('Rice')!,
      stationId: mainKitchen.id,
      price: 280,
      taxRatePercent: 5,
      isVeg: false,
    },

    // Chicken
    {
      id: 'demo-item-grilled-chicken',
      name: 'Quarter Grilled Chicken',
      description: 'Flame-grilled tender chicken served with house garlic dip and coleslaw.',
      imageUrl: '/api/uploads/demo-grilled-chicken.jpg',
      categoryId: catMap.get('Chicken')!,
      stationId: mainKitchen.id,
      price: 220,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-crispy-chicken',
      name: 'Crispy Fried Chicken (2 Pcs)',
      description: 'Golden crispy chicken pieces with secret herb crust.',
      imageUrl: '/api/uploads/demo-crispy-chicken.jpg',
      categoryId: catMap.get('Chicken')!,
      stationId: mainKitchen.id,
      price: 250,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-butter-chicken',
      name: 'Butter Chicken',
      description: 'Silky rich tomato-butter gravy with char-grilled boneless chicken.',
      imageUrl: '/api/uploads/demo-butter-chicken.jpg',
      categoryId: catMap.get('Chicken')!,
      stationId: mainKitchen.id,
      price: 380,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-tikka-masala',
      name: 'Chicken Tikka Masala',
      description: 'Clay-oven roasted chicken tikka cooked in an aromatic, spiced creamy masala curry.',
      imageUrl: '/api/uploads/demo-tikka-masala.jpg',
      categoryId: catMap.get('Chicken')!,
      stationId: mainKitchen.id,
      price: 360,
      taxRatePercent: 5,
      isVeg: false,
    },

    // Beef
    {
      id: 'demo-item-beef-bhuna',
      name: 'Traditional Beef Bhuna',
      description: 'Rich, thick gravy beef curry slow-braised with caramelized onions.',
      imageUrl: '/api/uploads/demo-beef-bhuna.jpg',
      categoryId: catMap.get('Beef')!,
      stationId: mainKitchen.id,
      price: 350,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-beef-kala-bhuna',
      name: 'Chittagong Beef Kala Bhuna',
      description: 'Classic dark roasted beef with roasted spice blend and mustard oil.',
      imageUrl: '/api/uploads/demo-kala-bhuna.jpg',
      categoryId: catMap.get('Beef')!,
      stationId: mainKitchen.id,
      price: 420,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-beef-steak',
      name: 'Sizzling Beef Tenderloin Steak',
      description: 'Juicy seared beef steak basted with herb garlic butter and served with pepper sauce.',
      imageUrl: '/api/uploads/demo-beef-steak.jpg',
      categoryId: catMap.get('Beef')!,
      stationId: mainKitchen.id,
      price: 580,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-beef-kebab',
      name: 'Charcoal Beef Seekh Kebab',
      description: 'Minced spiced beef skewers char-grilled over hot coals served with mint chutney.',
      imageUrl: '/api/uploads/demo-beef-kebab.jpg',
      categoryId: catMap.get('Beef')!,
      stationId: mainKitchen.id,
      price: 300,
      taxRatePercent: 5,
      isVeg: false,
    },

    // Fish
    {
      id: 'demo-item-fish-fingers',
      name: 'Crispy Fish Fingers',
      description: 'Fresh crumb-coated fish batons served with tartar sauce.',
      imageUrl: '/api/uploads/demo-fish-fingers.jpg',
      categoryId: catMap.get('Fish')!,
      stationId: mainKitchen.id,
      price: 280,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-grilled-dory',
      name: 'Pan-Grilled Dory Fish',
      description: 'Butter-basted white fish fillet seasoned with lemon pepper.',
      imageUrl: '/api/uploads/demo-grilled-fish.jpg',
      categoryId: catMap.get('Fish')!,
      stationId: mainKitchen.id,
      price: 450,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-garlic-prawns',
      name: 'Butter Garlic Jumbo Prawns',
      description: 'Pan-seared jumbo tiger prawns tossed in rich garlic herb butter sauce.',
      imageUrl: '/api/uploads/demo-prawns.jpg',
      categoryId: catMap.get('Fish')!,
      stationId: mainKitchen.id,
      price: 480,
      taxRatePercent: 5,
      isVeg: false,
    },

    // Fast Food
    {
      id: 'demo-item-beef-burger',
      name: 'Urban Classic Beef Burger',
      description: 'Juicy smashed beef patty, cheddar, caramelized onions, and house sauce.',
      imageUrl: '/api/uploads/demo-beef-burger.jpg',
      categoryId: catMap.get('Fast Food')!,
      stationId: mainKitchen.id,
      price: 250,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-chicken-burger',
      name: 'Crispy Chicken Zinger Burger',
      description: 'Crispy buttermilk fried chicken fillet, melted cheddar, lettuce, and spicy mayo.',
      imageUrl: '/api/uploads/demo-chicken-burger.jpg',
      categoryId: catMap.get('Fast Food')!,
      stationId: mainKitchen.id,
      price: 240,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-margherita',
      name: 'Margherita Pizza',
      description: 'Classic Italian mozzarella, fresh basil, and tomato sauce.',
      imageUrl: '/api/uploads/demo-pizza-margherita.jpg',
      categoryId: catMap.get('Fast Food')!,
      stationId: mainKitchen.id,
      price: 420,
      taxRatePercent: 5,
      isVeg: true,
      modifierGroupId: crustGroup.id,
    },
    {
      id: 'demo-item-pepperoni',
      name: 'Pepperoni Supreme Pizza',
      description: 'Loaded with beef pepperoni slices, Italian mozzarella, and herb marinara.',
      imageUrl: '/api/uploads/demo-pizza-pepperoni.jpg',
      categoryId: catMap.get('Fast Food')!,
      stationId: mainKitchen.id,
      price: 480,
      taxRatePercent: 5,
      isVeg: false,
      modifierGroupId: crustGroup.id,
    },

    // Snacks
    {
      id: 'demo-item-french-fries',
      name: 'Crispy French Fries',
      description: 'Golden salted potato fries served with spiced dip.',
      imageUrl: '/api/uploads/demo-fries.jpg',
      categoryId: catMap.get('Snacks')!,
      stationId: mainKitchen.id,
      price: 120,
      taxRatePercent: 5,
      isVeg: true,
    },
    {
      id: 'demo-item-chicken-65',
      name: 'Chicken 65',
      description: 'South Asian spicy fried chicken bites tossed with curry leaves and chili.',
      imageUrl: '/api/uploads/demo-chicken-65.jpg',
      categoryId: catMap.get('Snacks')!,
      stationId: mainKitchen.id,
      price: 240,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-spring-rolls',
      name: 'Crispy Chicken Spring Rolls',
      description: 'Hand-rolled crispy wonton pastry filled with shredded chicken and veggies.',
      imageUrl: '/api/uploads/demo-spring-rolls.jpg',
      categoryId: catMap.get('Snacks')!,
      stationId: mainKitchen.id,
      price: 180,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-momos',
      name: 'Steamed Chicken Momos (6 Pcs)',
      description: 'Delicate steamed dumplings stuffed with spiced minced chicken, served with fiery sesame sauce.',
      imageUrl: '/api/uploads/demo-momos.jpg',
      categoryId: catMap.get('Snacks')!,
      stationId: mainKitchen.id,
      price: 200,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-mozzarella',
      name: 'Golden Mozzarella Sticks',
      description: 'Crunchy breadcrumb coated mozzarella cheese batons served with marinara sauce.',
      imageUrl: '/api/uploads/demo-mozzarella.jpg',
      categoryId: catMap.get('Snacks')!,
      stationId: mainKitchen.id,
      price: 220,
      taxRatePercent: 5,
      isVeg: true,
    },

    // Drinks
    {
      id: 'demo-item-cola',
      name: 'Coca-Cola (500ml)',
      description: 'Chilled refreshing soft drink bottle.',
      imageUrl: '/api/uploads/demo-cola.jpg',
      categoryId: catMap.get('Drinks')!,
      stationId: bar.id,
      price: 60,
      taxRatePercent: 5,
      isVeg: true,
    },
    {
      id: 'demo-item-mojito',
      name: 'Virgin Mint Mojito',
      description: 'Zesty lime, crushed fresh mint, and sparkling soda.',
      imageUrl: '/api/uploads/demo-mojito.jpg',
      categoryId: catMap.get('Drinks')!,
      stationId: bar.id,
      price: 150,
      taxRatePercent: 5,
      isVeg: true,
    },
    {
      id: 'demo-item-cold-coffee',
      name: 'Urban Iced Cold Coffee',
      description: 'Blended creamy cold espresso with rich chocolate drizzle.',
      imageUrl: '/api/uploads/demo-iced-coffee.jpg',
      categoryId: catMap.get('Drinks')!,
      stationId: bar.id,
      price: 140,
      taxRatePercent: 5,
      isVeg: true,
    },
    {
      id: 'demo-item-lemonade',
      name: 'Zesty Fresh Lemonade',
      description: 'Freshly squeezed lemons, mint sprig, rock salt, and chilled soda.',
      imageUrl: '/api/uploads/demo-lemonade.jpg',
      categoryId: catMap.get('Drinks')!,
      stationId: bar.id,
      price: 110,
      taxRatePercent: 5,
      isVeg: true,
    },
    {
      id: 'demo-item-smoothie',
      name: 'Alfonso Mango Smoothie',
      description: 'Thick mango puree blended with chilled creamy yogurt and honey.',
      imageUrl: '/api/uploads/demo-smoothie.jpg',
      categoryId: catMap.get('Drinks')!,
      stationId: bar.id,
      price: 170,
      taxRatePercent: 5,
      isVeg: true,
    },

    // Desserts
    {
      id: 'demo-item-falooda',
      name: 'Royal Kulfi Falooda',
      description: 'Layered vermicelli, rose syrup, sweet basil seeds, and pistachio kulfi.',
      imageUrl: '/api/uploads/demo-falooda.jpg',
      categoryId: catMap.get('Desserts')!,
      stationId: bar.id,
      price: 180,
      taxRatePercent: 5,
      isVeg: true,
    },
    {
      id: 'demo-item-brownie',
      name: 'Warm Sizzling Brownie',
      description: 'Warm fudge chocolate brownie with vanilla ice cream and chocolate sauce.',
      imageUrl: '/api/uploads/demo-brownie.jpg',
      categoryId: catMap.get('Desserts')!,
      stationId: bar.id,
      price: 220,
      taxRatePercent: 5,
      isVeg: true,
    },
    {
      id: 'demo-item-lava-cake',
      name: 'Molten Chocolate Lava Cake',
      description: 'Decadent baked chocolate cake with a warm flowing dark chocolate center.',
      imageUrl: '/api/uploads/demo-lava-cake.jpg',
      categoryId: catMap.get('Desserts')!,
      stationId: bar.id,
      price: 240,
      taxRatePercent: 5,
      isVeg: true,
    },
    {
      id: 'demo-item-ice-cream',
      name: 'Classic Vanilla Ice Cream Sundae',
      description: 'Double scoops of rich vanilla ice cream with toasted nuts and chocolate drizzle.',
      imageUrl: '/api/uploads/demo-ice-cream.jpg',
      categoryId: catMap.get('Desserts')!,
      stationId: bar.id,
      price: 150,
      taxRatePercent: 5,
      isVeg: true,
    },
  ];

  for (const item of demoItems) {
    await prisma.menuItem.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        price: item.price,
        isAvailable: true,
        isActive: true,
      },
      create: {
        id: item.id,
        branchId: branch.id,
        categoryId: item.categoryId,
        stationId: item.stationId,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        price: item.price,
        taxRatePercent: item.taxRatePercent,
        isVeg: item.isVeg,
        isAvailable: true,
        isActive: true,
        ...(item.modifierGroupId
          ? {
              modifierGroups: {
                create: [{ modifierGroupId: item.modifierGroupId }],
              },
            }
          : {}),
      },
    });
  }

  console.log('Seeding takeaway demo orders...');
  const itemById = new Map(demoItems.map((i) => [i.id, i]));

  const demoOrders: {
    id: string;
    orderNumber: string;
    paid: boolean;
    lines: { itemId: string; quantity: number }[];
  }[] = [
    {
      // Phoned in, sent to the kitchen, still waiting for pickup — shows up
      // live on the Kitchen Display with no table attached.
      id: 'demo-order-takeaway-1',
      orderNumber: 'TA-DEMO-0001',
      paid: false,
      lines: [
        { itemId: 'demo-item-chicken-65', quantity: 1 },
        { itemId: 'demo-item-cola', quantity: 2 },
      ],
    },
    {
      // Already picked up and paid — shows takeaway flowing all the way
      // through checkout, not just the kitchen side.
      id: 'demo-order-takeaway-2',
      orderNumber: 'TA-DEMO-0002',
      paid: true,
      lines: [
        { itemId: 'demo-item-butter-chicken', quantity: 1 },
        { itemId: 'demo-item-cola', quantity: 1 },
      ],
    },
  ];

  for (const demoOrder of demoOrders) {
    const lines = demoOrder.lines.map((line) => {
      const item = itemById.get(line.itemId)!;
      const priced = priceLine(line.quantity, item.price, item.taxRatePercent);
      return { item, quantity: line.quantity, priced };
    });
    const subtotal = round2(
      lines.reduce((sum, l) => sum + l.priced.lineTotal, 0),
    );
    const taxAmount = round2(
      lines.reduce((sum, l) => sum + l.priced.taxAmount, 0),
    );
    const itemStatus = demoOrder.paid ? 'SERVED' : 'NEW';

    const order = await prisma.order.upsert({
      where: { id: demoOrder.id },
      update: {},
      create: {
        id: demoOrder.id,
        branchId: branch.id,
        orderNumber: demoOrder.orderNumber,
        type: 'TAKEAWAY',
        status: demoOrder.paid ? 'PAID' : 'OPEN',
        createdById: owner.id,
        subtotal,
        taxAmount,
        totalAmount: subtotal,
        billedAt: demoOrder.paid ? new Date() : null,
        ...(demoOrder.paid
          ? { payments: { create: [{ method: 'CASH', amount: subtotal }] } }
          : {}),
      },
    });

    const itemsByStation = new Map<string | null, { id: string }[]>();
    for (const [idx, line] of lines.entries()) {
      const orderItem = await prisma.orderItem.upsert({
        where: { id: `${demoOrder.id}-item-${idx}` },
        update: {},
        create: {
          id: `${demoOrder.id}-item-${idx}`,
          orderId: order.id,
          menuItemId: line.item.id,
          nameSnapshot: line.item.name,
          unitPriceSnapshot: line.item.price,
          taxRateSnapshot: line.item.taxRatePercent,
          quantity: line.quantity,
          lineTotal: line.priced.lineTotal,
          status: itemStatus,
        },
      });
      const bucket = itemsByStation.get(line.item.stationId) ?? [];
      bucket.push({ id: orderItem.id });
      itemsByStation.set(line.item.stationId, bucket);
    }

    let ticketSeq = 1;
    for (const [stationId, items] of itemsByStation) {
      const kot = await prisma.kot.upsert({
        where: { id: `${demoOrder.id}-kot-${ticketSeq}` },
        update: {},
        create: {
          id: `${demoOrder.id}-kot-${ticketSeq}`,
          orderId: order.id,
          stationId: stationId ?? undefined,
          ticketNumber: `${demoOrder.orderNumber}-${ticketSeq}`,
          status: itemStatus,
          ...(demoOrder.paid
            ? {
                acceptedAt: new Date(),
                readyAt: new Date(),
                servedAt: new Date(),
              }
            : {}),
        },
      });
      ticketSeq += 1;
      for (const item of items) {
        await prisma.kotItem.upsert({
          where: { id: `${kot.id}-${item.id}` },
          update: {},
          create: {
            id: `${kot.id}-${item.id}`,
            kotId: kot.id,
            orderItemId: item.id,
            status: itemStatus,
          },
        });
      }
    }
  }

  // Seed Promotional Offers (Phase 06)
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const demoOffers = [
    {
      id: 'demo-offer-grand-opening',
      branchId: branch.id,
      name: 'Grand Opening Special',
      description: '15% discount on all orders above TK. 500.00 to celebrate UrbanBite launch.',
      type: 'PERCENTAGE' as const,
      value: 15,
      minOrderAmount: 500,
      maxDiscount: 300,
      startsAt: now,
      expiresAt: thirtyDaysLater,
      isActive: true,
    },
    {
      id: 'demo-offer-weekend-feast',
      branchId: branch.id,
      name: 'Weekend Feast Flat TK. 150 Off',
      description: 'Flat TK. 150 off on family meals and large dine-in orders exceeding TK. 800.00.',
      type: 'FIXED' as const,
      value: 150,
      minOrderAmount: 800,
      maxDiscount: null,
      startsAt: now,
      expiresAt: sixtyDaysLater,
      isActive: true,
    },
    {
      id: 'demo-offer-lunch-delight',
      branchId: branch.id,
      name: 'Executive Lunch 10% Off',
      description: '10% discount on weekday lunch orders above TK. 350.00.',
      type: 'PERCENTAGE' as const,
      value: 10,
      minOrderAmount: 350,
      maxDiscount: 150,
      startsAt: now,
      expiresAt: thirtyDaysLater,
      isActive: true,
    },
    {
      id: 'demo-offer-expired-promo',
      branchId: branch.id,
      name: 'Pre-Launch Early Bird',
      description: 'Expired promotional offer for historical tracking and test validation.',
      type: 'PERCENTAGE' as const,
      value: 20,
      minOrderAmount: 300,
      maxDiscount: 200,
      startsAt: thirtyDaysAgo,
      expiresAt: yesterday,
      isActive: false,
    },
  ];

  for (const offer of demoOffers) {
    await prisma.offer.upsert({
      where: { id: offer.id },
      update: {
        name: offer.name,
        description: offer.description,
        type: offer.type,
        value: offer.value,
        minOrderAmount: offer.minOrderAmount,
        maxDiscount: offer.maxDiscount,
        startsAt: offer.startsAt,
        expiresAt: offer.expiresAt,
        isActive: offer.isActive,
      },
      create: offer,
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
