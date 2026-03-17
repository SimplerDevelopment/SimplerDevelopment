import { generateSEO } from '@/lib/utils/seo';
import { Hero } from '@/components/sections/Hero';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { Card } from '@/components/ui/Card';

export const metadata = generateSEO({
  title: 'About Us',
  description: 'Learn about SimplerDevelopment - a team dedicated to creating impressive, interactive web experiences through innovative design, development, and automation.',
  path: '/about',
});

const values = [
  {
    id: '1',
    title: 'Innovation',
    description: 'We push boundaries with cutting-edge technologies like Three.js, React, and modern automation tools.',
    icon: 'lightbulb',
  },
  {
    id: '2',
    title: 'Quality',
    description: 'Every project is crafted with meticulous attention to detail, ensuring exceptional results.',
    icon: 'workspace_premium',
  },
  {
    id: '3',
    title: 'Collaboration',
    description: 'We work closely with our clients, making their vision our mission.',
    icon: 'group',
  },
  {
    id: '4',
    title: 'Simplicity',
    description: 'Complex problems deserve elegant solutions. We make the complicated simple.',
    icon: 'auto_awesome',
  },
];

const stats = [
  { label: 'Projects Delivered', value: '50+' },
  { label: 'Happy Clients', value: '40+' },
  { label: 'Years Experience', value: '10+' },
  { label: 'Technologies Mastered', value: '25+' },
];

export default function AboutPage() {
  return (
    <>
      <Hero
        subtitle="About SimplerDevelopment"
        title="Building Digital Experiences That Matter"
        description="We're a team of passionate developers, designers, and automation specialists dedicated to transforming ideas into exceptional digital solutions."
        ctaText="Work With Us"
        ctaLink="/contact"
        secondaryCtaText="View Our Work"
        secondaryCtaLink="/solutions"
      />

      {/* Mission Section */}
      <section className="py-20 bg-gradient-to-b from-background to-primary/3">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <FadeIn>
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-6">Our Mission</h2>
              <p className="text-xl text-muted-foreground leading-relaxed">
                At SimplerDevelopment, we believe that exceptional digital experiences shouldn&apos;t be complicated.
                Our mission is to harness the power of modern web technologies, interactive design, and intelligent
                automation to create solutions that not only meet but exceed expectations.
              </p>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <FadeIn>
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">Our Values</h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                The principles that guide everything we do
              </p>
            </FadeIn>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <SlideIn key={value.id} direction="up" delay={index * 0.1}>
                <Card
                  title={value.title}
                  description={value.description}
                  icon={value.icon}
                />
              </SlideIn>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-gradient-to-r from-primary/5 to-primary/3">
        <div className="container mx-auto px-4">
          <FadeIn>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                    {stat.value}
                  </div>
                  <div className="text-sm md:text-base text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* What We Do Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <FadeIn>
              <h2 className="font-display text-3xl md:text-5xl font-bold mb-12 text-center">
                What Sets Us Apart
              </h2>
            </FadeIn>

            <div className="space-y-12">
              <SlideIn direction="left">
                <div className="flex flex-col md:flex-row gap-6 items-start p-6 rounded-xl bg-muted/30 border border-border">
                  <span className="material-icons text-5xl text-primary">palette</span>
                  <div>
                    <h3 className="font-heading text-2xl font-bold mb-3">Interactive Design</h3>
                    <p className="text-muted-foreground">
                      We don&apos;t just build websites; we create immersive experiences. Using technologies
                      like Three.js and advanced animations, we bring your brand to life in ways that
                      captivate and engage your audience.
                    </p>
                  </div>
                </div>
              </SlideIn>

              <SlideIn direction="right">
                <div className="flex flex-col md:flex-row gap-6 items-start p-6 rounded-xl bg-muted/30 border border-border">
                  <span className="material-icons text-5xl text-primary">bolt</span>
                  <div>
                    <h3 className="font-heading text-2xl font-bold mb-3">Modern Development</h3>
                    <p className="text-muted-foreground">
                      Built on cutting-edge frameworks like Next.js and React, our solutions are fast,
                      scalable, and optimized for performance. We write clean, maintainable code that
                      stands the test of time.
                    </p>
                  </div>
                </div>
              </SlideIn>

              <SlideIn direction="left">
                <div className="flex flex-col md:flex-row gap-6 items-start p-6 rounded-xl bg-muted/30 border border-border">
                  <span className="material-icons text-5xl text-primary">smart_toy</span>
                  <div>
                    <h3 className="font-heading text-2xl font-bold mb-3">Intelligent Automation</h3>
                    <p className="text-muted-foreground">
                      We specialize in automation solutions using tools like n8n to streamline your
                      workflows, reduce manual tasks, and boost productivity. Let technology work
                      for you, not the other way around.
                    </p>
                  </div>
                </div>
              </SlideIn>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-b from-primary/3 to-background">
        <div className="container mx-auto px-4 text-center">
          <FadeIn>
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-6">
              Ready to Work Together?
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Let&apos;s discuss how we can help bring your vision to life with innovative design,
              development, and automation solutions.
            </p>
            <a
              href="/contact"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-4 text-lg font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Get in Touch
            </a>
          </FadeIn>
        </div>
      </section>
    </>
  );
}
