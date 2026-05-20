/* Root composition: 4 artboards inside the design canvas. */
const { DesignCanvas, DCSection, DCArtboard } = window;

function App(){
  return (
    <DesignCanvas
      title="ReseñaHub"
      subtitle="Gestión interna de reseñas por comercial · exploración v1"
      background="#EDEDF0"
    >
      <DCSection id="admin" title="Administrador">
        <DCArtboard id="dashboard" label="01 · Dashboard general" width={1440} height={1024}>
          <AdminDashboard />
        </DCArtboard>
        <DCArtboard id="profile" label="02 · Ficha del comercial" width={1440} height={1024}>
          <SalespersonProfile />
        </DCArtboard>
      </DCSection>

      <DCSection id="self" title="Comercial">
        <DCArtboard id="self-view" label="03 · Vista del comercial" width={1440} height={1024}>
          <SalespersonSelf />
        </DCArtboard>
        <DCArtboard id="verification" label="04 · Verificación silenciosa" width={1440} height={1024}>
          <VerificationScreen />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
