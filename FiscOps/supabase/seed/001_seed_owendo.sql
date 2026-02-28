insert into centers (id, name, objective_annual)
values ('OWENDO', 'Centre des impôts d''Owendo', 120000000000)
on conflict (id) do update set objective_annual = excluded.objective_annual;

insert into ifus (center_id, code, label, sectors) values
('OWENDO','IFU 1','BTP', ARRAY['BTP','Construction','Travaux publics']),
('OWENDO','IFU 2','Commerce / Restauration', ARRAY['Restaurant','Hôtel','Tourisme','Décoration','Commerce','Boulangerie']),
('OWENDO','IFU 3','Industrie / Ressources', ARRAY['Forêt','Bois','Logistique','Industrie','Pétrole','Mine','Transport']),
('OWENDO','IFU 4','Réglementé / Santé / Éducation', ARRAY['Notaire','Avocat','École','Immobilier','Établissement privé','Pharmacie','Clinique']),
('OWENDO','IFU 5','Services divers', ARRAY['Communication','Laverie','Pressing','Télécommunication','Pompes funèbres','Gardiennage','Sécurité','Placement','Location d''engins','Nettoyage'])
on conflict (center_id, code) do nothing;
