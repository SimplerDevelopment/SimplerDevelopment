'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { staggerContainerVariants, staggerItemVariants } from '@/lib/utils/animations';

export interface Service {
  id: string;
  title: string;
  description: string;
  icon?: string;
  link?: string;
  image?: string;
}

interface ServicesGridProps {
  title?: string;
  description?: string;
  services: Service[];
}

export function ServicesGrid({ title, description, services }: ServicesGridProps) {
  return (
    <div className="container mx-auto px-4">
        {(title || description) && (
          <div className="text-center mb-16">
            {title && (
              <h2 className="font-heading text-4xl md:text-5xl font-bold mb-4 text-green-400 drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]">{title}</h2>
            )}
            {description && (
              <p className="text-xl text-green-100/80 max-w-2xl mx-auto">
                {description}
              </p>
            )}
          </div>
        )}

        <motion.div
          variants={staggerContainerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {services.map((service) => (
            <motion.div key={service.id} variants={staggerItemVariants}>
              <Card
                title={service.title}
                description={service.description}
                image={service.image}
                link={service.link}
                icon={service.icon}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
  );
}
