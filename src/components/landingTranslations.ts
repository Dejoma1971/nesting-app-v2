export type Language = "pt" | "en" | "es";

export const translations = {
  pt: {
    nav: {
      login: "Entrar",
      trial: "Teste Grátis",
      origin: "O Conceito",
      features: "Funcionalidades",
      pricing: "Planos",
      contact: "Contato"
    },
    hero: {
      title: "Corte Inteligente.\nEconomia Real.",
      subtitle: "A solução definitiva para quem cansou de softwares caros e complexos.",
      cta: "COMEÇAR AGORA GRATUITAMENTE",
      disclaimer: "Trial de 30 dias • Sem cartão de crédito",
    },
    // --- NOVA SEÇÃO: MANIFESTO / POR QUE FOI CRIADO ---
    origin: {
      title: "Liberdade e Autonomia para sua Produção",
      p1: "Corte CNC 2D inteligente, custo baixo e sem dependência.",
      p2: "Se sua empresa lida com corte de chapas, painéis ou peças planas e já cansou dos softwares de nesting caros, complexos e cheios de limitações, você encontrou a solução.",
      p3: "Nosso aplicativo foi desenvolvido para quem busca eficiência no corte, controle total e economia real.",
      highlight: "Sem mensalidades abusivas, sem licenças travadas, sem complicações. Simples, prático e acessível."
    },
    // --- NOVA LISTA DETALHADA DE FUNCIONALIDADES ---
    features: {
      title: "Tudo o que você precisa",
      subtitle: "Ferramentas poderosas para o chão de fábrica e engenharia.",
      list: [
        {
          icon: "🚀",
          title: "Motores de Nesting",
          desc: "Smart Nest e Guilhotina rodando no navegador (baixa latência). Reduz a carga do servidor e garante resultados rápidos."
        },
        {
          icon: "📂",
          title: "Importação/Exportação",
          desc: "Importe peças DXF e salve o arranjo final em DXF local. Compatibilidade total com o padrão da indústria."
        },
        {
          icon: "☁️",
          title: "Banco de Dados",
          desc: "Salve e busque infinitas peças no servidor. Valor ilimitado para gerenciar grandes bibliotecas de peças."
        },
        {
          icon: "🔍",
          title: "Gestão de Peças",
          desc: "Filtre peças por número de pedido, OP, material e espessura. Organização essencial para o fluxo de produção."
        },
        {
          icon: "✋",
          title: "Otimização Manual",
          desc: "Seleção, rotação, ajuste fino e devolução ao banco. Flexibilidade para o operador refinar o automático."
        },
        {
          icon: "💥",
          title: "Detectar Colisão",
          desc: "Indica visualmente se há peças sobrepostas. Uma ferramenta indispensável que evita prejuízos reais."
        },
        {
          icon: "⚙️",
          title: "Materiais Customizáveis",
          desc: "Cadastre materiais, espessuras e densidades específicas para otimizar suas métricas de custo e peso."
        },
        {
          icon: "✂️",
          title: "Ferramentas de Chapa",
          desc: "Defina gap, margem, linhas de retalho (horizontal/vertical) e adicione novas chapas. Controle total da mesa."
        },
        {
          icon: "🏷️",
          title: "Marcação CNC",
          desc: "Texto automático para identificação e gravação (Laser). Reduz erros de separação e marcação manual."
        },
        {
          icon: "📊",
          title: "Métricas e ROI",
          desc: "Acompanhe o percentual de aproveitamento e densidade. Ajuda a quantificar a economia de material na ponta do lápis."
        }
      ]
    },
    pricing: {
      title: "Planos Flexíveis",
      subtitle: "Escolha a opção ideal para sua produção.",
      month: "/mês",
      trial: {
        name: "Trial",
        price: "U$ 0,00",
        cta: "Criar Conta",
        features: [
          "✅ 30 Dias de acesso",
          "✅ Motor Guilhotina e Nesting",
          "✅ Lista de Materiais Estática",
          "❌ Sem Acesso ao Banco de Dados",
        ],
      },
      premium: {
        name: "Premium",
        price: "U$ 24,90",
        badge: "MAIS POPULAR",
        cta: "Assinar Agora",
        features: [
          "✅ Peças Ilimitadas",
          "✅ Banco de Dados na Nuvem",
          "✅ Customização de Materiais",
          "✅ Exportação DXF e PDF",
        ],
      },
      corporate: {
        name: "Corporativo",
        price: "U$ 24,90",
        extra: "+ U$ 12,00 / usuário",
        cta: "Assinar Equipe",
        features: [
          "✅ Tudo do Premium",
          "✅ Múltiplos Usuários (Até 5)",
          "✅ Gestão Centralizada",
          "✅ Suporte Prioritário",
        ],
      },
    },
    contact: {
      title: "Fale Conosco",
      desc: "Dúvidas sobre o plano Corporativo ou suporte técnico?",
      cta: "Enviar E-mail"
    },
    footer: {
      rights: "Todos os direitos reservados.",
      terms: "Termos de Uso",
      privacy: "Privacidade",
      support: "Suporte",
    },
  },
  en: {
    nav: {
      login: "Login",
      trial: "Free Trial",
      origin: "The Concept",
      features: "Features",
      pricing: "Pricing",
      contact: "Contact"
    },
    hero: {
      title: "Smart Cutting.\nReal Savings.",
      subtitle: "The definitive solution for those tired of expensive and complex software.",
      cta: "START FREE NOW",
      disclaimer: "30-day Trial • No credit card required",
    },
    origin: {
      title: "Freedom and Autonomy for your Production",
      p1: "Smart 2D CNC cutting, without high costs and without dependency.",
      p2: "If your company deals with cutting sheets, panels, or flat parts and is tired of expensive, complex nesting software full of limitations, you have found the solution.",
      p3: "Our app was developed for those seeking cutting efficiency, total control, and real savings.",
      highlight: "No abusive monthly fees, no locked licenses, no complications. Simple, practical, and affordable."
    },
    features: {
      title: "Everything you need",
      subtitle: "Powerful tools for the shop floor and engineering.",
      list: [
        {
          icon: "🚀",
          title: "Nesting Engines",
          desc: "Smart Nest and Guillotine running in the browser (low latency). Reduces server load and ensures fast results."
        },
        {
          icon: "📂",
          title: "Import/Export",
          desc: "Import DXF parts and save the final layout to local DXF. Full industry standard compatibility."
        },
        {
          icon: "☁️",
          title: "Database",
          desc: "Save and search infinite parts on the server. Unlimited value for managing large part libraries."
        },
        {
          icon: "🔍",
          title: "Part Management",
          desc: "Filter parts by Order number, OP, material, and thickness. Essential organization for production flow."
        },
        {
          icon: "✋",
          title: "Manual Optimization",
          desc: "Select, rotate, fine-tune position, and return to bank. Flexibility for the operator to refine automatic results."
        },
        {
          icon: "💥",
          title: "Collision Detection",
          desc: "Visually indicates overlapping parts. An indispensable tool that prevents real losses."
        },
        {
          icon: "⚙️",
          title: "Custom Materials",
          desc: "Register specific materials, thicknesses, and densities to optimize cost and weight metrics."
        },
        {
          icon: "✂️",
          title: "Sheet Tools",
          desc: "Set gap, margins, remnant cut lines (horizontal/vertical), and add new sheets. Total table control."
        },
        {
          icon: "🏷️",
          title: "CNC Marking",
          desc: "Automatic text for identification and etching (Laser). Reduces sorting errors and manual marking."
        },
        {
          icon: "📊",
          title: "Metrics & ROI",
          desc: "Track utilization percentage and density. Helps quantify material savings accurately."
        }
      ]
    },
    pricing: {
      title: "Flexible Plans",
      subtitle: "Choose the perfect option for your production.",
      month: "/mo",
      trial: {
        name: "Trial",
        price: "U$ 0.00",
        cta: "Create Account",
        features: [
          "✅ 30 Days Access",
          "✅ Guillotine & Nesting Engine",
          "✅ Static Material List",
          "❌ No Database Access",
        ],
      },
      premium: {
        name: "Premium",
        price: "U$ 24.90",
        badge: "MOST POPULAR",
        cta: "Subscribe Now",
        features: [
          "✅ Unlimited Parts",
          "✅ Cloud Database",
          "✅ Custom Materials",
          "✅ DXF & PDF Export",
        ],
      },
      corporate: {
        name: "Corporate",
        price: "U$ 24.90",
        extra: "+ U$ 12.00 / user",
        cta: "Subscribe Team",
        features: [
          "✅ All Premium Features",
          "✅ Multiple Users (Up to 5)",
          "✅ Centralized Management",
          "✅ Priority Support",
        ],
      },
    },
    contact: {
      title: "Contact Us",
      desc: "Questions about the Corporate plan or technical support?",
      cta: "Send Email"
    },
    footer: {
      rights: "All rights reserved.",
      terms: "Terms of Use",
      privacy: "Privacy",
      support: "Support",
    },
  },
  es: {
    nav: {
      login: "Entrar",
      trial: "Prueba Gratis",
      origin: "El Concepto",
      features: "Funciones",
      pricing: "Precios",
      contact: "Contacto"
    },
    hero: {
      title: "Corte Inteligente.\nAhorro Real.",
      subtitle: "La solución definitiva para quienes están cansados de software costoso y complejo.",
      cta: "COMENZAR GRATIS AHORA",
      disclaimer: "Prueba de 30 días • No requiere tarjeta",
    },
    origin: {
      title: "Libertad y Autonomía para su Producción",
      p1: "Corte CNC 2D inteligente, sin alto costo y sin dependencia.",
      p2: "Si su empresa trabaja con corte de chapas, paneles o piezas planas y está cansada de software de nesting costoso, complejo y lleno de limitaciones, ha encontrado la solución.",
      p3: "Nuestra aplicación fue desarrollada para quienes buscan eficiencia en el corte, control total y ahorro real.",
      highlight: "Sin mensualidades abusivas, sin licencias bloqueadas, sin complicaciones. Simple, práctico y accesible."
    },
    features: {
      title: "Todo lo que necesita",
      subtitle: "Herramientas potentes para el taller y la ingeniería.",
      list: [
        {
          icon: "🚀",
          title: "Motores de Nesting",
          desc: "Smart Nest y Guillotina ejecutándose en el navegador (baja latencia). Reduce la carga del servidor y garantiza resultados rápidos."
        },
        {
          icon: "📂",
          title: "Importación/Exportación",
          desc: "Importe piezas DXF y guarde el diseño final en DXF local. Compatibilidad total con el estándar de la industria."
        },
        {
          icon: "☁️",
          title: "Base de Datos",
          desc: "Guarde y busque infinitas piezas en el servidor. Valor ilimitado para gestionar grandes bibliotecas de piezas."
        },
        {
          icon: "🔍",
          title: "Gestión de Piezas",
          desc: "Filtre piezas por número de pedido, OP, material y espesor. Organización esencial para el flujo de producción."
        },
        {
          icon: "✋",
          title: "Optimización Manual",
          desc: "Selección, rotación, ajuste fino y devolución al banco. Flexibilidad para que el operador refine el automático."
        },
        {
          icon: "💥",
          title: "Detectar Colisión",
          desc: "Indica visualmente si hay piezas superpuestas. Una herramienta indispensable que evita pérdidas reales."
        },
        {
          icon: "⚙️",
          title: "Materiales Personalizados",
          desc: "Registre materiales, espesores y densidades específicas para optimizar sus métricas de costo y peso."
        },
        {
          icon: "✂️",
          title: "Herramientas de Chapa",
          desc: "Defina gap, margen, líneas de retal (horizontal/vertical) y agregue nuevas chapas. Control total de la mesa."
        },
        {
          icon: "🏷️",
          title: "Marcado CNC",
          desc: "Texto automático para identificación y grabado (Láser). Reduce errores de separación y marcado manual."
        },
        {
          icon: "📊",
          title: "Métricas y ROI",
          desc: "Siga el porcentaje de aprovechamiento y densidad. Ayuda a cuantificar el ahorro de material con precisión."
        }
      ]
    },
    pricing: {
      title: "Planes Flexibles",
      subtitle: "Elija la opción ideal para su producción.",
      month: "/mes",
      trial: {
        name: "Prueba",
        price: "U$ 0,00",
        cta: "Crear Cuenta",
        features: [
          "✅ 30 Días de acceso",
          "✅ Motor Guillotina y Nesting",
          "✅ Lista de Materiales Estática",
          "❌ Sin Acceso a Base de Datos",
        ],
      },
      premium: {
        name: "Premium",
        price: "U$ 24,90",
        badge: "MÁS POPULAR",
        cta: "Suscribirse",
        features: [
          "✅ Piezas Ilimitadas",
          "✅ Base de Datos en la Nube",
          "✅ Materiales Personalizados",
          "✅ Exportación DXF y PDF",
        ],
      },
      corporate: {
        name: "Corporativo",
        price: "U$ 24,90",
        extra: "+ U$ 12,00 / usuario",
        cta: "Suscribir Equipo",
        features: [
          "✅ Todo del Premium",
          "✅ Múltiples Usuarios (Hasta 5)",
          "✅ Gestión Centralizada",
          "✅ Soporte Prioritario",
        ],
      },
    },
    contact: {
      title: "Hable con Nosotros",
      desc: "¿Dudas sobre el plan Corporativo o soporte técnico?",
      cta: "Enviar E-mail"
    },
    footer: {
      rights: "Todos los derechos reservados.",
      terms: "Términos de Uso",
      privacy: "Privacidad",
      support: "Soporte",
    },
  },
};