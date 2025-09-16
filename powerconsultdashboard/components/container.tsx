const Container = ({ children }: { children?: React.ReactNode }) => {
  return (
    <div className="flex justify-center items-center min-h-screen">
      {children || "container"}
    </div>
  );
};

export default Container;
